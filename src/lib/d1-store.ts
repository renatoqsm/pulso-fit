import Decimal from 'decimal.js';
import type { PrismaClient } from '@prisma/client';
import metadata from '../../data/schema/models.json';
import type { D1Binding, D1Statement } from './d1-types';
import { HttpError } from './http-error';

type Row = Record<string, any>;
type Args = Record<string, any>;
type Field = {
  name: string;
  kind: string;
  type: string;
  isList: boolean;
  isRequired: boolean;
  isId: boolean;
  isUnique: boolean;
  isUpdatedAt?: boolean;
  default?: unknown;
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
};
type Model = {
  name: string;
  fields: Field[];
  primaryKey?: { fields: string[] } | null;
  uniqueFields: string[][];
};
const models = metadata.models as unknown as Model[];
const modelByName = new Map(models.map((m) => [m.name, m]));
const scalarFields = (m: Model) => m.fields.filter((f) => f.kind !== 'object');
const pk = (m: Model) => m.primaryKey?.fields ?? m.fields.filter((f) => f.isId).map((f) => f.name);
const quote = (name: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid SQL identifier');
  return '"' + name + '"';
};
const list = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
function encoded(field: Field, value: any): any {
  if (value === undefined || value === null) return null;
  if (field.isList || field.type === 'Json') return JSON.stringify(value);
  if (field.type === 'DateTime') return new Date(value).toISOString();
  if (field.type === 'Boolean') return value ? 1 : 0;
  if (field.type === 'Decimal') return new Decimal(value).toFixed();
  if (field.type === 'Bytes') return new Uint8Array(value);
  return value;
}
function decoded(model: Model, raw: Row): Row {
  const row: Row = {};
  for (const f of scalarFields(model)) {
    const value = raw[f.name];
    if (value == null) {
      row[f.name] = null;
      continue;
    }
    row[f.name] =
      f.isList || f.type === 'Json'
        ? typeof value === 'string'
          ? JSON.parse(value)
          : value
        : f.type === 'DateTime'
          ? new Date(value)
          : f.type === 'Boolean'
            ? Boolean(value)
            : f.type === 'Decimal'
              ? new Decimal(value)
              : f.type === 'Bytes'
                ? new Uint8Array(value)
                : value;
  }
  return row;
}
function persisted(model: Model, row: Row): Row {
  return Object.fromEntries(scalarFields(model).map((f) => [f.name, encoded(f, row[f.name])]));
}
function rowKey(model: Model, row: Row) {
  return JSON.stringify(pk(model).map((k) => row[k]));
}
function failure(code: string, message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.name = 'PrismaClientKnownRequestError';
  error.code = code;
  return error;
}
function normalizedError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/UNIQUE constraint|PRIMARY KEY constraint/i.test(message))
    throw failure('P2002', 'Registro duplicado.');
  if (/FOREIGN KEY constraint/i.test(message)) throw failure('P2003', 'Referência inválida.');
  throw error;
}
type Pending =
  { kind: 'insert'; model: Model; row: Row } | { kind: 'sql'; sql: string; values: unknown[] };
type Overlay = Map<string, Map<string, Row | null>>;
type Unit = {
  revision: number;
  overlay: Overlay;
  commands: Pending[];
  cache: Map<string, Map<string, Row>>;
  coverage: Map<string, Row[]>;
  committed: (() => Promise<void> | void)[];
};
function flatWhere(model: Model, where: Args | undefined): Row | null {
  const out: Row = {};
  for (const [key, value] of Object.entries(where ?? {})) {
    const field = model.fields.find((f) => f.name === key);
    if (field?.kind === 'object' || ['AND', 'OR', 'NOT'].includes(key)) return null;
    if (!field && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (
          !model.fields.some((f) => f.name === k && f.kind !== 'object') ||
          (v !== null && typeof v === 'object')
        )
          return null;
        out[k] = v;
      }
    } else {
      if (!field || (value !== null && typeof value === 'object' && !(value instanceof Date)))
        return null;
      out[key] = value;
    }
  }
  return out;
}
function equalValue(a: any, b: any) {
  return a instanceof Date || b instanceof Date
    ? new Date(a).getTime() === new Date(b).getTime()
    : a === b;
}
class Query {
  values: unknown[] = [];
  aliases = 0;
  constructor(readonly store: D1Store) {}
  param(value: unknown) {
    this.values.push(value);
    return '?';
  }
  source(model: Model) {
    return quote(this.store.unit?.overlay.has(model.name) ? '__view_' + model.name : model.name);
  }
  relation(model: Model, field: Field, parent: string, child: string) {
    const target = modelByName.get(field.type)!;
    if (field.relationFromFields?.length)
      return field.relationFromFields
        .map(
          (f, i) => parent + '.' + quote(f) + '=' + child + '.' + quote(field.relationToFields![i]),
        )
        .join(' AND ');
    const reverse = target.fields.find(
      (f) =>
        f.kind === 'object' &&
        f.type === model.name &&
        f.relationName === field.relationName &&
        f.relationFromFields?.length,
    );
    if (!reverse) throw new Error('Unknown relation ' + model.name + '.' + field.name);
    return reverse
      .relationFromFields!.map(
        (f, i) => child + '.' + quote(f) + '=' + parent + '.' + quote(reverse.relationToFields![i]),
      )
      .join(' AND ');
  }
  where(model: Model, where: Args | undefined, alias: string): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(where ?? {})) {
      if (value === undefined) continue;
      if (['AND', 'OR', 'NOT'].includes(key)) {
        const groups = list(value).map((v) => this.where(model, v, alias));
        if (key === 'OR') parts.push(groups.length ? '(' + groups.join(' OR ') + ')' : '0');
        else if (key === 'AND')
          parts.push('(' + (groups.length ? groups.join(' AND ') : '1') + ')');
        else parts.push('NOT (' + (groups.length ? groups.join(' AND ') : '1') + ')');
        continue;
      }
      const field = model.fields.find((f) => f.name === key);
      if (!field) {
        if (value && typeof value === 'object') {
          parts.push(this.where(model, value, alias));
          continue;
        }
        throw new Error('Unknown query field ' + model.name + '.' + key);
      }
      if (field.kind === 'object') {
        const target = modelByName.get(field.type)!,
          child = 'rel' + ++this.aliases;
        const relation = this.relation(model, field, alias, child);
        const conditions = value as Args;
        const some = conditions && Object.hasOwn(conditions, 'some');
        const none = conditions && Object.hasOwn(conditions, 'none');
        const every = conditions && Object.hasOwn(conditions, 'every');
        const isNot = conditions && Object.hasOwn(conditions, 'isNot');
        const is = conditions && Object.hasOwn(conditions, 'is');
        const condition = some
          ? conditions.some
          : none
            ? conditions.none
            : every
              ? conditions.every
              : isNot
                ? conditions.isNot
                : is
                  ? conditions.is
                  : conditions;
        let predicate = condition === null ? '1' : this.where(target, condition, child);
        if (every) predicate = 'NOT (' + predicate + ')';
        const exists =
          'EXISTS (SELECT 1 FROM ' +
          this.source(target) +
          ' ' +
          child +
          ' WHERE ' +
          relation +
          ' AND (' +
          predicate +
          '))';
        parts.push(
          none || every || (isNot && condition !== null) || (condition === null && !isNot)
            ? 'NOT ' + exists
            : exists,
        );
        continue;
      }
      const column = alias + '.' + quote(key);
      if (value === null) {
        parts.push(column + ' IS NULL');
        continue;
      }
      if (value instanceof Date || typeof value !== 'object' || Array.isArray(value)) {
        parts.push(column + '=' + this.param(encoded(field, value)));
        continue;
      }
      for (const [op, v] of Object.entries(value as Args)) {
        if (op === 'mode' || v === undefined) continue;
        if (op === 'equals') {
          parts.push(
            v === null ? column + ' IS NULL' : column + '=' + this.param(encoded(field, v)),
          );
          continue;
        }
        if (op === 'not') {
          parts.push(
            v === null
              ? column + ' IS NOT NULL'
              : 'NOT (' + this.where(model, { [key]: v }, alias) + ')',
          );
          continue;
        }
        if (op === 'in' || op === 'notIn') {
          parts.push(
            column +
              (op === 'notIn' ? ' NOT IN ' : ' IN ') +
              '(SELECT value FROM json_each(' +
              this.param(JSON.stringify((v as any[]).map((x) => encoded(field, x)))) +
              '))',
          );
          continue;
        }
        if (op === 'has') {
          parts.push(
            'EXISTS (SELECT 1 FROM json_each(' + column + ') WHERE value=' + this.param(v) + ')',
          );
          continue;
        }
        if (
          op === 'contains' &&
          field.name === 'searchText' &&
          ['Food', 'Exercise'].includes(model.name) &&
          !this.store.unit?.overlay.has(model.name)
        ) {
          const terms = String(v).match(/[\p{L}\p{N}_]+/gu) ?? [];
          if (terms.length) {
            const search = model.name + 'Search';
            const match = terms
              .map((term) => '"' + term.replaceAll('"', '""') + '"*')
              .join(' AND ');
            parts.push(
              alias +
                '.rowid IN (SELECT rowid FROM ' +
                quote(search) +
                ' WHERE ' +
                quote(search) +
                ' MATCH ' +
                this.param(match) +
                ')',
            );
            continue;
          }
        }
        if (['contains', 'startsWith', 'endsWith'].includes(op)) {
          const insensitive = value.mode === 'insensitive';
          const left = insensitive ? 'lower(' + column + ')' : column;
          const right = insensitive ? 'lower(' + this.param(v) + ')' : this.param(v);
          parts.push(
            op === 'contains'
              ? 'instr(' + left + ',' + right + ')>0'
              : op === 'startsWith'
                ? 'substr(' +
                  left +
                  ',1,length(' +
                  right +
                  '))=' +
                  (insensitive ? 'lower(' + this.param(v) + ')' : this.param(v))
                : 'substr(' +
                  left +
                  ',-length(' +
                  right +
                  '))=' +
                  (insensitive ? 'lower(' + this.param(v) + ')' : this.param(v)),
          );
          continue;
        }
        const operator = ({ gt: '>', gte: '>=', lt: '<', lte: '<=' } as Record<string, string>)[op];
        if (!operator) throw new Error('Unsupported query operator ' + op);
        parts.push(column + operator + this.param(encoded(field, v)));
      }
    }
    return parts.length ? parts.map((p) => '(' + p + ')').join(' AND ') : '1';
  }
  order(model: Model, input: Args | Args[] | undefined, alias: string): string[] {
    const result: string[] = [];
    for (const entry of list(input))
      for (const [key, value] of Object.entries(entry)) {
        const field = model.fields.find((f) => f.name === key);
        if (!field) throw new Error('Unknown order field');
        if (field.kind !== 'object') {
          result.push(alias + '.' + quote(key) + (value === 'desc' ? ' DESC' : ' ASC'));
          continue;
        }
        const target = modelByName.get(field.type)!,
          child = 'ord' + ++this.aliases;
        for (const expression of this.order(target, value, child)) {
          const direction = expression.endsWith(' DESC') ? ' DESC' : ' ASC';
          const column = expression.slice(0, -direction.length);
          result.push(
            '(SELECT ' +
              column +
              ' FROM ' +
              this.source(target) +
              ' ' +
              child +
              ' WHERE ' +
              this.relation(model, field, alias, child) +
              ' LIMIT 1)' +
              direction,
          );
        }
      }
    return result;
  }
  prefix() {
    const views: string[] = [];
    for (const [name, changes] of this.store.unit?.overlay ?? []) {
      const model = modelByName.get(name)!;
      const payload = [...changes].map(([key, row]) => ({
        key: JSON.parse(key),
        row: row
          ? Object.fromEntries(
              Object.entries(persisted(model, row)).map(([k, v]) => [
                k,
                v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v,
              ]),
            )
          : null,
      }));
      const json = JSON.stringify(payload);
      const match = pk(model)
        .map((key, i) => 'base.' + quote(key) + "=json_extract(ov.value,'$.key[" + i + "]')")
        .join(' AND ');
      const columns = scalarFields(model);
      const extract = (f: Field) =>
        f.type === 'Bytes'
          ? "unhex(json_extract(ov.value,'$.row." + f.name + "'))"
          : "json_extract(ov.value,'$.row." + f.name + "')";
      views.push(
        quote('__view_' + name) +
          ' AS (SELECT ' +
          columns.map((f) => 'base.' + quote(f.name)).join(',') +
          ' FROM ' +
          quote(name) +
          ' base WHERE NOT EXISTS (SELECT 1 FROM json_each(' +
          this.param(json) +
          ') ov WHERE ' +
          match +
          ') UNION ALL SELECT ' +
          columns.map(extract).join(',') +
          ' FROM json_each(' +
          this.param(json) +
          ") ov WHERE json_type(ov.value,'$.row')<>'null')",
      );
    }
    return views.length ? 'WITH ' + views.join(',') + ' ' : '';
  }
}

export class D1Store {
  readonly delegates: Record<string, any> = {};
  constructor(
    readonly binding: D1Binding,
    readonly unit?: Unit,
  ) {
    for (const model of models) {
      const api: Record<string, any> = {};
      for (const method of [
        'findMany',
        'findFirst',
        'findUnique',
        'findFirstOrThrow',
        'findUniqueOrThrow',
        'count',
        'create',
        'createMany',
        'update',
        'updateMany',
        'delete',
        'deleteMany',
        'upsert',
      ]) {
        api[method] = (args: Args = {}) => this.operation(model, method, args);
      }
      const name = model.name[0].toLowerCase() + model.name.slice(1);
      this.delegates[name] = api;
      Object.defineProperty(this, name, { value: api });
    }
  }
  asClient() {
    return this as unknown as PrismaClient;
  }
  async rows(query: Query, sql: string): Promise<Row[]> {
    if (
      query.values.some(
        (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') > 1500000,
      )
    )
      throw new HttpError(
        413,
        'O lote é grande demais para uma operação D1. Reduza a ficha ou o plano.',
      );
    const result = await this.binding
      .prepare(sql)
      .bind(...query.values)
      .all<Row>();
    return result.results ?? [];
  }
  remember(model: Model, rows: Row[], where?: Args, complete = false) {
    if (!this.unit) return;
    let cache = this.unit.cache.get(model.name);
    if (!cache) {
      cache = new Map();
      this.unit.cache.set(model.name, cache);
    }
    for (const row of rows) cache.set(rowKey(model, row), row);
    const plain = flatWhere(model, where);
    const cover =
      plain ??
      (Object.entries(where ?? {}).every(
        ([k, v]) =>
          model.fields.some((f) => f.name === k && f.kind !== 'object') &&
          (v === null ||
            typeof v !== 'object' ||
            v instanceof Date ||
            (v && typeof v === 'object' && Array.isArray((v as any).in))),
      )
        ? where
        : null);
    if (complete && cover) {
      const coverage = this.unit.coverage.get(model.name) ?? [];
      coverage.push(cover);
      this.unit.coverage.set(model.name, coverage);
    }
  }
  cached(model: Model, where: Args | undefined): Row[] | null {
    if (!this.unit) return null;
    const flat = flatWhere(model, where);
    if (!flat) return null;
    const rows = new Map(this.unit.cache.get(model.name) ?? []);
    for (const [key, row] of this.unit.overlay.get(model.name) ?? []) {
      if (row) rows.set(key, row);
      else rows.delete(key);
    }
    const matches = [...rows.values()].filter((row) =>
      Object.entries(flat).every(([k, v]) => equalValue(row[k], v)),
    );
    const covered = (this.unit.coverage.get(model.name) ?? []).some((c) =>
      Object.entries(c).every(
        ([k, v]) =>
          Object.hasOwn(flat, k) &&
          (v && typeof v === 'object' && Array.isArray(v.in)
            ? v.in.some((item: any) => equalValue(flat[k], item))
            : equalValue(flat[k], v)),
      ),
    );
    const unique =
      pk(model).every((k) => Object.hasOwn(flat, k)) ||
      model.fields.some((f) => f.isUnique && Object.hasOwn(flat, f.name)) ||
      model.uniqueFields.some((keys) => keys.every((k) => Object.hasOwn(flat, k)));
    return covered || (unique && matches.length) ? matches : null;
  }
  async select(model: Model, args: Args = {}): Promise<Row[]> {
    let rows = list(args.orderBy).some((v) =>
      Object.values(v).some((order) => typeof order === 'object'),
    )
      ? null
      : this.cached(model, args.where);
    if (rows) {
      rows = [...rows];
      const orders = list(args.orderBy).flatMap((v) => Object.entries(v));
      if (orders.length)
        rows.sort((a, b) => {
          for (const [key, direction] of orders) {
            const av = a[key] instanceof Date ? a[key].getTime() : a[key],
              bv = b[key] instanceof Date ? b[key].getTime() : b[key];
            const cmp = av === bv ? 0 : av == null ? -1 : bv == null ? 1 : av < bv ? -1 : 1;
            if (cmp) return direction === 'desc' ? -cmp : cmp;
          }
          return 0;
        });
      rows = rows.slice(
        args.skip ?? 0,
        args.take === undefined ? undefined : (args.skip ?? 0) + args.take,
      );
    } else {
      const query = new Query(this);
      const prefix = query.prefix();
      const where = query.where(model, args.where, 'r');
      const orders = query.order(model, args.orderBy, 'r');
      const selected = Object.entries(args.select ?? {})
        .filter(([, value]) => value === true)
        .map(([name]) => name);
      const scalarOnly =
        !args.include &&
        selected.length > 0 &&
        Object.entries(args.select ?? {}).every(
          ([name, value]) =>
            !value ||
            (value === true &&
              model.fields.some((field) => field.name === name && field.kind !== 'object')),
        );
      const projection = scalarOnly ? selected.map((name) => 'r.' + quote(name)).join(',') : 'r.*';
      let sql =
        prefix + 'SELECT ' + projection + ' FROM ' + query.source(model) + ' r WHERE ' + where;
      if (orders.length) sql += ' ORDER BY ' + orders.join(',');
      if (args.take !== undefined) sql += ' LIMIT ' + query.param(args.take);
      else if (args.skip) sql += ' LIMIT -1';
      if (args.skip) sql += ' OFFSET ' + query.param(args.skip);
      rows = (await this.rows(query, sql)).map((r) => decoded(model, r));
      // Partial rows must never populate the complete-record cache used by mutations.
      if (!scalarOnly)
        this.remember(model, rows, args.where, args.take === undefined && !args.skip);
    }
    return this.project(model, rows, args);
  }
  async project(model: Model, source: Row[], args: Args): Promise<Row[]> {
    const rows = source.map((r) => ({ ...r }));
    const relations = model.fields.filter(
      (f) => f.kind === 'object' && (args.include?.[f.name] || args.select?.[f.name]),
    );
    await Promise.all(
      relations.map(async (field) => {
        const target = modelByName.get(field.type)!;
        const config = args.include?.[field.name] ?? args.select?.[field.name];
        const nested = config === true ? {} : config;
        let from: string[], to: string[];
        if (field.relationFromFields?.length) {
          from = field.relationFromFields;
          to = field.relationToFields!;
        } else {
          const reverse = target.fields.find(
            (f) =>
              f.kind === 'object' &&
              f.type === model.name &&
              f.relationName === field.relationName &&
              f.relationFromFields?.length,
          )!;
          from = reverse.relationToFields!;
          to = reverse.relationFromFields!;
        }
        const tuples = rows
          .filter((r) => from.every((k) => r[k] != null))
          .map((r) => from.map((k) => r[k]));
        if (!tuples.length) {
          for (const row of rows) row[field.name] = field.isList ? [] : null;
          return;
        }
        const where =
          from.length === 1
            ? { [to[0]]: { in: [...new Set(tuples.map((v) => v[0]))] } }
            : { OR: tuples.map((v) => Object.fromEntries(to.map((k, i) => [k, v[i]]))) };
        // Keep relation keys available for grouping even under a nested select.
        const related = await this.select(target, {
          ...nested,
          take: undefined,
          skip: undefined,
          select: nested.select
            ? { ...nested.select, ...Object.fromEntries(to.map((k) => [k, true])) }
            : undefined,
          where: { AND: [where, nested.where ?? {}] },
        });
        for (const row of rows) {
          let matches = related.filter((r) => from.every((k, i) => equalValue(row[k], r[to[i]])));
          matches = matches.slice(
            nested.skip ?? 0,
            nested.take === undefined ? undefined : (nested.skip ?? 0) + nested.take,
          );
          if (nested.select)
            matches = matches.map((r) =>
              Object.fromEntries(
                Object.entries(nested.select)
                  .filter(([, v]) => v)
                  .map(([k]) => [k, r[k]]),
              ),
            );
          row[field.name] = field.isList ? matches : (matches[0] ?? null);
        }
      }),
    );
    if (args.select)
      return rows.map((row) =>
        Object.fromEntries(
          Object.entries(args.select)
            .filter(([, v]) => v)
            .map(([k]) => [k, row[k]]),
        ),
      );
    return rows;
  }
  overlay(model: Model, row: Row | null, key?: string) {
    const changes = this.unit!.overlay.get(model.name) ?? new Map();
    changes.set(key ?? rowKey(model, row!), row);
    this.unit!.overlay.set(model.name, changes);
  }
  defaults(model: Model, data: Args): Row {
    const row: Row = {};
    for (const f of scalarFields(model)) {
      if (data[f.name] !== undefined) {
        row[f.name] = data[f.name];
        continue;
      }
      if (f.default !== undefined) {
        const d = f.default as any;
        row[f.name] =
          d && typeof d === 'object' && !Array.isArray(d) && d.name
            ? d.name === 'now'
              ? new Date()
              : d.name === 'cuid' || d.name === 'uuid'
                ? crypto.randomUUID()
                : (() => {
                    throw new Error('Unsupported default');
                  })()
            : structuredClone(d);
      } else if (f.isUpdatedAt) row[f.name] = new Date();
      else if (!f.isRequired) row[f.name] = null;
      else throw new Error('Missing required field ' + model.name + '.' + f.name);
    }
    return decoded(model, persisted(model, row));
  }
  async create(model: Model, args: Args): Promise<Row> {
    const data = { ...args.data };
    for (const field of model.fields.filter(
      (f) => f.kind === 'object' && f.relationFromFields?.length && data[f.name],
    )) {
      const action = data[field.name];
      if (action.connect || action.create) {
        const target = modelByName.get(field.type)!;
        const row = action.connect
          ? await this.select(target, { where: action.connect, take: 1 }).then((r) => r[0])
          : await this.create(target, { data: action.create });
        if (!row) throw failure('P2025', 'Referência não encontrada.');
        field.relationFromFields!.forEach((k, i) => (data[k] = row[field.relationToFields![i]]));
      }
    }
    const row = this.defaults(model, data);
    this.overlay(model, row);
    this.unit!.commands.push({ kind: 'insert', model, row });
    await this.nested(model, row, data);
    return (await this.project(model, [row], args))[0];
  }
  async nested(model: Model, row: Row, data: Args) {
    for (const field of model.fields.filter(
      (f) => f.kind === 'object' && !f.relationFromFields?.length && data[f.name],
    )) {
      const action = data[field.name],
        target = modelByName.get(field.type)!;
      const reverse = target.fields.find(
        (f) =>
          f.kind === 'object' &&
          f.type === model.name &&
          f.relationName === field.relationName &&
          f.relationFromFields?.length,
      )!;
      const foreign = Object.fromEntries(
        reverse.relationFromFields!.map((k, i) => [k, row[reverse.relationToFields![i]]]),
      );
      if (action.deleteMany)
        await this.operation(target, 'deleteMany', {
          where: { AND: [foreign, action.deleteMany] },
        });
      for (const child of list(action.create))
        await this.create(target, { data: { ...child, ...foreign } });
      if (action.createMany)
        await this.operation(target, 'createMany', {
          ...action.createMany,
          data: list(action.createMany.data).map((v) => ({ ...v, ...foreign })),
        });
    }
  }
  keyWhere(model: Model, rows: Row[], query: Query) {
    if (pk(model).length === 1)
      return (
        quote(pk(model)[0]) +
        ' IN (SELECT value FROM json_each(' +
        query.param(JSON.stringify(rows.map((r) => r[pk(model)[0]]))) +
        '))'
      );
    const keys = pk(model);
    return (
      'EXISTS (SELECT 1 FROM json_each(' +
      query.param(JSON.stringify(rows.map((r) => keys.map((k) => r[k])))) +
      ') x WHERE ' +
      keys
        .map((k, i) => quote(model.name) + '.' + quote(k) + "=json_extract(x.value,'$[" + i + "]')")
        .join(' AND ') +
      ')'
    );
  }
  async change(model: Model, args: Args, remove = false): Promise<Row[]> {
    const rows = await this.select(model, { where: args.where });
    if (!rows.length) return [];
    if (remove) {
      const query = new Query(this),
        where = this.keyWhere(model, rows, query);
      this.unit!.commands.push({
        kind: 'sql',
        sql: 'DELETE FROM ' + quote(model.name) + ' WHERE ' + where,
        values: query.values,
      });
      for (const row of rows) this.overlay(model, null, rowKey(model, row));
      return rows;
    }
    const data = { ...args.data };
    if (!Object.entries(data).some(([, v]) => v !== undefined)) return rows;
    for (const f of scalarFields(model)) if (f.isUpdatedAt) data[f.name] = new Date();
    const query = new Query(this),
      assignments: string[] = [];
    for (const field of scalarFields(model)) {
      const value = data[field.name];
      if (value === undefined) continue;
      if (
        value &&
        typeof value === 'object' &&
        !(value instanceof Date) &&
        !field.isList &&
        field.type !== 'Json' &&
        field.type !== 'Bytes' &&
        !(value instanceof Decimal)
      ) {
        if (Object.hasOwn(value, 'increment'))
          assignments.push(
            quote(field.name) + '=' + quote(field.name) + '+' + query.param(value.increment),
          );
        else if (Object.hasOwn(value, 'decrement'))
          assignments.push(
            quote(field.name) + '=' + quote(field.name) + '-' + query.param(value.decrement),
          );
        else if (Object.hasOwn(value, 'set'))
          assignments.push(quote(field.name) + '=' + query.param(encoded(field, value.set)));
        else throw new Error('Unsupported mutation');
      } else assignments.push(quote(field.name) + '=' + query.param(encoded(field, value)));
    }
    if (assignments.length) {
      const where = this.keyWhere(model, rows, query);
      this.unit!.commands.push({
        kind: 'sql',
        sql: 'UPDATE ' + quote(model.name) + ' SET ' + assignments.join(',') + ' WHERE ' + where,
        values: query.values,
      });
    }
    const updated: Row[] = [];
    for (const old of rows) {
      const row = { ...old };
      for (const field of scalarFields(model)) {
        const value = data[field.name];
        if (value === undefined) continue;
        row[field.name] =
          value &&
          typeof value === 'object' &&
          !(value instanceof Date) &&
          !field.isList &&
          !['Json', 'Bytes', 'Decimal'].includes(field.type)
            ? Object.hasOwn(value, 'increment')
              ? row[field.name] + value.increment
              : Object.hasOwn(value, 'decrement')
                ? row[field.name] - value.decrement
                : value.set
            : value;
      }
      const normalized = decoded(model, persisted(model, row));
      this.overlay(model, normalized);
      await this.nested(model, normalized, data);
      updated.push(normalized);
    }
    return updated;
  }
  async operation(model: Model, method: string, args: Args): Promise<any> {
    const read = [
      'findMany',
      'findFirst',
      'findUnique',
      'findFirstOrThrow',
      'findUniqueOrThrow',
      'count',
    ].includes(method);
    if (!read && !this.unit)
      return this.$transaction((tx) =>
        (tx as any).delegates[model.name[0].toLowerCase() + model.name.slice(1)][method](args),
      );
    if (read) {
      if (method === 'count') {
        const query = new Query(this),
          prefix = query.prefix(),
          where = query.where(model, args.where, 'r');
        return Number(
          (
            await this.rows(
              query,
              prefix + 'SELECT count(*) AS n FROM ' + query.source(model) + ' r WHERE ' + where,
            )
          )[0]?.n ?? 0,
        );
      }
      const rows = await this.select(model, {
        ...args,
        ...(method === 'findMany' ? {} : { take: 1 }),
      });
      if (method === 'findMany') return rows;
      if (!rows.length && method.endsWith('OrThrow'))
        throw failure('P2025', 'Registro não encontrado.');
      return rows[0] ?? null;
    }
    if (method === 'create') return this.create(model, args);
    if (method === 'createMany') {
      let count = 0;
      for (const data of list(args.data)) {
        if (args.skipDuplicates) {
          const keys = [
            pk(model),
            ...model.fields.filter((f) => f.isUnique).map((f) => [f.name]),
            ...model.uniqueFields,
          ];
          let duplicate = false;
          for (const unique of keys.filter(
            (keys) => keys.length && keys.every((k) => data[k] != null),
          )) {
            if (
              (
                await this.select(model, {
                  where: Object.fromEntries(unique.map((k) => [k, data[k]])),
                  take: 1,
                })
              ).length
            ) {
              duplicate = true;
              break;
            }
          }
          if (duplicate) continue;
        }
        await this.create(model, { data });
        count++;
      }
      return { count };
    }
    if (method === 'upsert') {
      const existing = (await this.select(model, { where: args.where, take: 1 }))[0];
      return existing
        ? this.operation(model, 'update', { ...args, data: args.update })
        : this.create(model, { ...args, data: args.create });
    }
    const remove = method.startsWith('delete');
    const rows = await this.change(model, args, remove);
    if (method.endsWith('Many')) return { count: rows.length };
    if (!rows.length) throw failure('P2025', 'Registro não encontrado.');
    return (await this.project(model, [rows[0]], args))[0];
  }
  statements(): D1Statement[] {
    const result: D1Statement[] = [];
    let inserts: Extract<Pending, { kind: 'insert' }>[] = [];
    const flush = () => {
      const grouped = new Map<string, Extract<Pending, { kind: 'insert' }>[]>();
      for (const command of inserts) {
        const items = grouped.get(command.model.name) ?? [];
        items.push(command);
        grouped.set(command.model.name, items);
      }
      // A child queued for an existing parent can precede a new parent of the
      // same model. Order grouped inserts by FK dependencies, not first use.
      const remaining = new Map(grouped);
      const ordered: (typeof inserts)[] = [];
      while (remaining.size) {
        const ready = [...remaining].find(([name, items]) =>
          items[0].model.fields.every(
            (field) =>
              !field.relationFromFields?.length ||
              field.type === name ||
              !remaining.has(field.type),
          ),
        );
        if (!ready) throw new Error('Cyclic grouped insert dependencies.');
        ordered.push(ready[1]);
        remaining.delete(ready[0]);
      }
      for (const items of ordered) {
        const model = items[0].model,
          fields = scalarFields(model);
        // One JSON binding batches inserts without exceeding D1's SQL parameter limit.
        const rows = items.map((c) =>
          Object.fromEntries(
            Object.entries(persisted(model, c.row)).map(([k, v]) => [
              k,
              v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v,
            ]),
          ),
        );
        const expressions = fields.map((f) =>
          f.type === 'Bytes'
            ? "unhex(json_extract(value,'$." + f.name + "'))"
            : "json_extract(value,'$." + f.name + "')",
        );
        let chunk: Row[] = [];
        let bytes = 2;
        const emit = () => {
          if (!chunk.length) return;
          const json = JSON.stringify(chunk);
          result.push(
            this.binding
              .prepare(
                'INSERT INTO ' +
                  quote(model.name) +
                  ' (' +
                  fields.map((f) => quote(f.name)).join(',') +
                  ') SELECT ' +
                  expressions.join(',') +
                  ' FROM json_each(?)',
              )
              .bind(json),
          );
          chunk = [];
          bytes = 2;
        };
        for (const row of rows) {
          const size = Buffer.byteLength(JSON.stringify(row), 'utf8') + 1;
          if (size > 1500000)
            throw new HttpError(413, 'Registro excede o tamanho suportado pelo D1.');
          if (chunk.length && bytes + size > 512000) emit();
          chunk.push(row);
          bytes += size;
        }
        emit();
      }
      inserts = [];
    };
    for (const command of this.unit!.commands) {
      if (command.kind === 'insert') inserts.push(command);
      else {
        flush();
        result.push(this.binding.prepare(command.sql).bind(...command.values));
      }
    }
    flush();
    return result;
  }
  async $transaction<T>(fn: (db: PrismaClient) => Promise<T>, _options?: unknown): Promise<T> {
    if (typeof fn !== 'function')
      throw new Error('Use callback transactions; eager Promise arrays are not atomic.');
    if (this.unit) {
      const unit = this.unit;
      const savepoint = {
        length: unit.commands.length,
        callbacks: unit.committed.length,
        overlay: new Map([...unit.overlay].map(([k, v]) => [k, new Map(v)])),
        cache: new Map([...unit.cache].map(([k, v]) => [k, new Map(v)])),
        coverage: new Map([...unit.coverage].map(([k, v]) => [k, [...v]])),
      };
      try {
        return await fn(this.asClient());
      } catch (error) {
        unit.commands.length = savepoint.length;
        unit.committed.length = savepoint.callbacks;
        unit.overlay = savepoint.overlay;
        unit.cache = savepoint.cache;
        unit.coverage = savepoint.coverage;
        throw error;
      }
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const { results } = await this.binding
        .prepare('SELECT revision FROM "__StoreClock" WHERE id=1')
        .all<{ revision: number }>();
      const revision = Number(results[0].revision);
      const tx = new D1Store(this.binding, {
        revision,
        overlay: new Map(),
        commands: [],
        cache: new Map(),
        coverage: new Map(),
        committed: [],
      });
      const value = await fn(tx.asClient());
      if (!tx.unit!.commands.length) {
        const check = await this.binding
          .prepare('SELECT revision FROM "__StoreClock" WHERE id=1')
          .all<{ revision: number }>();
        if (Number(check.results[0].revision) !== revision) {
          if (attempt === 4)
            throw new HttpError(
              409,
              'Dados alterados durante a consulta. Recarregue para obter a versão atual.',
            );
          continue;
        }
        for (const callback of tx.unit!.committed) await callback();
        return value;
      }
      const id = crypto.randomUUID();
      try {
        await this.binding.batch([
          this.binding
            .prepare('INSERT INTO "__CommitGuard" (id,revision) VALUES (?,?)')
            .bind(id, revision),
          ...tx.statements(),
          this.binding.prepare('DELETE FROM "__CommitGuard" WHERE id=?').bind(id),
        ]);
        for (const callback of tx.unit!.committed) await callback();
        return value;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('PULSO_WRITE_CONFLICT')) {
          if (attempt === 4)
            throw new HttpError(
              409,
              'Outra alteração ocorreu durante a gravação. Recarregue e tente novamente.',
            );
          continue;
        }
        normalizedError(error);
      }
    }
    throw new Error('Unreachable');
  }
  async onCommit(callback: () => Promise<void> | void) {
    if (this.unit) this.unit.committed.push(callback);
    else await callback();
  }
  async $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    const sql = strings.join('?');
    if (!/\bRateLimit\b/.test(sql) && /\b(INSERT|UPDATE|DELETE)\b/i.test(sql))
      throw new Error('Use repository writes for transactional data.');
    return (
      await this.binding
        .prepare(sql)
        .bind(...values.map((v) => (v instanceof Date ? v.toISOString() : v)))
        .all()
    ).results as T;
  }
  async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    const sql = strings.join('?');
    return (
      (
        await this.binding
          .prepare(sql)
          .bind(...values.map((v) => (v instanceof Date ? v.toISOString() : v)))
          .run()
      ).meta?.changes ?? 0
    );
  }
  async $disconnect() {}
}
