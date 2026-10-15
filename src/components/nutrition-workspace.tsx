'use client';
import { useEffect, useRef, useState } from 'react';
import { WorkflowShell } from './workflow-shell';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { ArrowLeft, Search, Utensils, Plus } from 'lucide-react';
import {
  scaleNutrients,
  totalNutrients,
  macroDistribution,
  multiplyQuantities,
  type Nutrients,
} from '@/lib/nutrition-math';
type Food = {
  id: string;
  name: string;
  ownerId: string | null;
  referenceUnit: 'g' | 'ml';
  preparation: string;
  aliases: string[];
  nutrients: Nutrients;
  provenance: {
    source: string;
    type?: string;
    yieldQuantity?: string;
    yieldUnit?: 'g' | 'ml';
    ingredients?: Item[];
  };
  active: boolean;
  measures: { id: string; name: string; quantity: string; unit: string; provenance: string }[];
};
type Item = {
  foodId: string;
  quantity: string;
  unit: 'g' | 'ml';
  measureId?: string;
  substitutions: Omit<Item, 'substitutions'>[];
  snapshot?: {
    name: string;
    nutrients: Nutrients;
    referenceUnit: string;
    provenance: unknown;
    measure?: { name: string; enteredQuantity: string } | null;
  };
};
type Meal = { id?: string; name: string; time: string | null; notes: string; items: Item[] };
type Version = {
  id: string;
  number: number;
  publishedAt: string | null;
  draftRevision: number;
  objective: string;
  notes: string;
  validFrom: string | null;
  meals: Meal[];
  plan?: { id: string; name: string };
};
type Data = {
  own: { id: string; name: string; versions: Version[] }[];
  assigned: { version: Version }[];
  archived?: { version: Version }[];
  students: { id: string; profile: { name: string } }[];
  enabled: boolean;
  role: string;
};
type Log = {
  id: string;
  revision: number;
  date: string;
  mealName: string;
  prescribedMealId: string | null;
  notes: string;
  consumedAt: string | null;
  items: (Item & { snapshot: { name: string; nutrients: Nutrients } })[];
  replies: { id: string; text: string }[];
  prescribed?: { name: string; totals: Nutrients };
  differences?: Nutrients;
};
const macroNames: Record<string, string> = {
  energy_kcal: 'Energia (kcal)',
  protein_g: 'Proteínas (g)',
  carbohydrate_g: 'Carboidratos (g)',
  fat_g: 'Lipídios (g)',
  fiber_g: 'Fibras (g)',
  sugar_g: 'Açúcares (g)',
  sodium_mg: 'Sódio (mg)',
  calcium_mg: 'Cálcio (mg)',
  iron_mg: 'Ferro (mg)',
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const format = (v: string | null | undefined) =>
  v == null ? 'Não informado' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const withUnit = (value: string | null | undefined, unit: string) =>
  value == null ? 'não informado' : format(value) + ' ' + unit;
const simple = (i: Pick<Item, 'foodId' | 'quantity' | 'unit' | 'measureId'>) => ({
  foodId: i.foodId,
  quantity: i.quantity,
  unit: i.unit,
  ...(i.measureId ? { measureId: i.measureId } : {}),
});
export function NutritionWorkspace() {
  const [data, setData] = useState<Data>();
  const [foods, setFoods] = useState<Food[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('diary');
  const [activeMeal, setActiveMeal] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [foodMatches, setFoodMatches] = useState<string[]>([]);
  const [version, setVersion] = useState<Version>();
  const [draft, setDraft] = useState<{
    objective: string;
    notes: string;
    validFrom: string | null;
    meals: Meal[];
  }>({ objective: '', notes: '', validFrom: null, meals: [] });
  const [targets, setTargets] = useState<string[]>([]);
  const [date, setDate] = useState(today());
  const [studentId, setStudentId] = useState('');
  const [daily, setDaily] = useState<{ logs: Log[]; totals: Nutrients; macros: string[] | null }>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingFood, setEditingFood] = useState<Food | null | undefined>();
  const [recipe, setRecipe] = useState<Item[]>([]);
  const [recipeSource, setRecipeSource] = useState<Food>();
  const [measures, setMeasures] = useState<
    { name: string; quantity: string; unit: 'g' | 'ml'; provenance: string }[]
  >([]);
  const [logging, setLogging] = useState<{
    id: string;
    revision: number;
    mealName: string;
    prescribedMealId: string | null;
    notes: string;
    items: Item[];
    allowedItems?: Item[];
  }>();
  const foodForm = useRef<HTMLFormElement>(null);
  async function load() {
    const res = await fetch('/api/nutrition');
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    setData(result);
    return result as Data;
  }
  async function loadFoods() {
    const res = await fetch(`/api/foods?q=${encodeURIComponent(search)}`);
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    setFoodMatches(result.items.map((food: Food) => food.id));
    setFoods((previous) => [
      ...previous.filter((food) => !result.items.some((next: Food) => next.id === food.id)),
      ...result.items,
    ]);
  }
  async function loadDiary() {
    const res = await fetch(`/api/meals?date=${date}${studentId ? '&studentId=' + studentId : ''}`);
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    setDaily(result);
  }
  useEffect(() => {
    void load()
      .then((v) => {
        const requested = window.location.hash.slice(1);
        if (['plans', 'diary', 'foods', 'recipes'].includes(requested)) setTab(requested);
        else if (v.role === 'PROFESSIONAL') setTab('plans');
      })
      .catch((e) => setMessage(e.message));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void loadFoods().catch((e) => setMessage(e.message)), 200);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (data?.role === 'STUDENT' || studentId) void loadDiary().catch((e) => setMessage(e.message));
  }, [date, studentId, data?.role]);
  useEffect(() => {
    const change = () => {
      const value = window.location.hash.slice(1);
      if (['plans', 'diary', 'foods', 'recipes'].includes(value)) setTab(value);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useUnsavedChanges(dirty);
  async function action(path: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch('/api/' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setMessage(result.message);
      await load();
      await loadFoods();
      if (data?.role === 'STUDENT' || studentId) await loadDiary();
      if (result.versionId) {
        const v = await (await fetch(`/api/nutrition/version/${result.versionId}`)).json();
        select(v);
      } else if (version && path.startsWith('nutrition/')) {
        const v = await (await fetch(`/api/nutrition/version/${version.id}`)).json();
        select(v);
      }
      return result;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  }
  function select(v: Version) {
    setVersion(v);
    setActiveMeal(0);
    setDirty(false);
    setDraft({
      objective: v.objective,
      notes: v.notes,
      validFrom: v.validFrom,
      meals: v.meals.map((m) => ({
        name: m.name,
        time: m.time,
        notes: m.notes,
        items: m.items.map((i) => ({ ...simple(i), substitutions: i.substitutions.map(simple) })),
      })),
    });
    setTab('plans');
  }
  function mutate(fn: (v: typeof draft) => void) {
    setDirty(true);
    setDraft((v) => {
      const n = structuredClone(v);
      fn(n);
      return n;
    });
  }
  function snapshot(i: Item) {
    return i.snapshot ?? foods.find((f) => f.id === i.foodId);
  }
  function total(items: Item[]) {
    return totalNutrients(
      items.map((i) => {
        const source = snapshot(i);
        const values = source?.nutrients ?? {};
        const measure = i.measureId
          ? foods.find((f) => f.id === i.foodId)?.measures.find((m) => m.id === i.measureId)
          : undefined;
        if (
          !i.quantity ||
          (i.measureId && !measure) ||
          (!i.measureId && source?.referenceUnit !== i.unit)
        )
          return Object.fromEntries(Object.keys(values).map((k) => [k, null]));
        return scaleNutrients(
          values,
          measure ? multiplyQuantities(i.quantity, measure.quantity) : i.quantity || '0',
        );
      }),
    );
  }
  const activePlans =
    data?.assigned.filter(
      (a, _, all) =>
        !all.some(
          (b) => b.version.plan?.id === a.version.plan?.id && b.version.number > a.version.number,
        ),
    ) ?? [];
  return (
    <WorkflowShell
      title="Alimentação"
      activeHref={tab === 'diary' ? '/alimentacao#diary' : '/alimentacao#plans'}
    >
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <p className="muted">
        {data?.role === 'STUDENT'
          ? 'Planejamento pessoal, planos profissionais e consumo real separados.'
          : 'Prescrições alimentares e registros dos alunos vinculados na sua área.'}
      </p>
      <nav className="builder-tabs" aria-label="Áreas de alimentação">
        {[
          ['diary', 'Diário'],
          ['plans', 'Planos'],
          ['foods', 'Alimentos'],
          ['recipes', 'Receitas'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'selected' : 'secondary'}
            onClick={() => {
              setTab(key);
              window.history.replaceState(null, '', '#' + key);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {!data ? (
        <p role="status">Carregando…</p>
      ) : (
        <>
          {tab === 'foods' && (
            <>
              <section className="card row wrap">
                <label style={{ flex: 1 }}>
                  Buscar alimentos
                  <input
                    value={search}
                    maxLength={100}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                {data.enabled && (
                  <button
                    onClick={() => {
                      setEditingFood(null);
                      setMeasures([]);
                    }}
                  >
                    Cadastrar alimento / rótulo
                  </button>
                )}
              </section>
              <p className="muted small" style={{ marginTop: 18 }}>
                A base global ainda depende de importação de fonte licenciada. Você pode cadastrar
                dados reais de rótulos com procedência. Nutrientes ausentes permanecem não
                informados.
              </p>
              {editingFood !== undefined && (
                <section className="card" style={{ marginTop: 20 }}>
                  <h2>{editingFood ? 'Editar alimento' : 'Novo alimento / rótulo'}</h2>
                  <form
                    ref={foodForm}
                    key={editingFood?.id ?? 'new'}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const values = Object.fromEntries(
                        Object.keys(macroNames).map((k) => [
                          k,
                          f.get(k) === '' ? null : String(f.get(k)),
                        ]),
                      );
                      const result = await action(
                        editingFood ? `foods/${editingFood.id}/update` : 'foods/create',
                        {
                          name: f.get('name'),
                          preparation: f.get('preparation'),
                          aliases: String(f.get('aliases'))
                            .split(',')
                            .map((v) => v.trim())
                            .filter(Boolean),
                          referenceUnit: f.get('referenceUnit'),
                          nutrients: values,
                          provenance: f.get('provenance'),
                          measures,
                        },
                      );
                      if (result) setEditingFood(undefined);
                    }}
                  >
                    <div className="field">
                      <label>
                        Nome
                        <input
                          name="name"
                          required
                          minLength={2}
                          maxLength={200}
                          defaultValue={editingFood?.name}
                        />
                      </label>
                    </div>
                    <div className="field">
                      <label>
                        Nomes alternativos (vírgula)
                        <input
                          name="aliases"
                          defaultValue={editingFood?.aliases.join(', ')}
                          maxLength={1000}
                        />
                      </label>
                    </div>
                    <div className="set-grid">
                      <label>
                        Preparo
                        <input
                          name="preparation"
                          defaultValue={editingFood?.preparation}
                          maxLength={200}
                        />
                      </label>
                      <label>
                        Referência de 100
                        <select
                          name="referenceUnit"
                          defaultValue={editingFood?.referenceUnit ?? 'g'}
                        >
                          <option value="g">gramas</option>
                          <option value="ml">mililitros</option>
                        </select>
                      </label>
                    </div>
                    <h3 style={{ marginTop: 20 }}>Nutrientes por 100 g ou 100 ml</h3>
                    <div className="set-grid">
                      {Object.entries(macroNames).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            name={key}
                            type="number"
                            min="0"
                            max="1000000"
                            step="0.00000001"
                            defaultValue={editingFood?.nutrients[key] ?? ''}
                          />
                        </label>
                      ))}
                    </div>
                    <label style={{ marginTop: 18 }}>
                      Procedência (marca, rótulo, fonte e versão)
                      <textarea
                        name="provenance"
                        required
                        minLength={3}
                        maxLength={1000}
                        defaultValue={editingFood?.provenance.source}
                      />
                    </label>
                    <h3 style={{ marginTop: 20 }}>Medidas caseiras específicas deste alimento</h3>
                    {measures.map((measure, index) => (
                      <div className="set-grid" key={index} style={{ marginBottom: 12 }}>
                        <label>
                          Nome (colher, fatia, porção…)
                          <input
                            required
                            maxLength={80}
                            value={measure.name}
                            onChange={(e) =>
                              setMeasures((v) =>
                                v.map((m, i) => (i === index ? { ...m, name: e.target.value } : m)),
                              )
                            }
                          />
                        </label>
                        <label>
                          Equivalência medida
                          <input
                            required
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            value={measure.quantity}
                            onChange={(e) =>
                              setMeasures((v) =>
                                v.map((m, i) =>
                                  i === index ? { ...m, quantity: e.target.value } : m,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Unidade da equivalência
                          <select
                            aria-label="Unidade da equivalência"
                            value={measure.unit}
                            onChange={(e) =>
                              setMeasures((v) =>
                                v.map((m, i) =>
                                  i === index ? { ...m, unit: e.target.value as 'g' | 'ml' } : m,
                                ),
                              )
                            }
                          >
                            <option value="g">g</option>
                            <option value="ml">ml</option>
                          </select>
                        </label>
                        <label>
                          Procedência da medida
                          <input
                            required
                            minLength={3}
                            maxLength={500}
                            value={measure.provenance}
                            onChange={(e) =>
                              setMeasures((v) =>
                                v.map((m, i) =>
                                  i === index ? { ...m, provenance: e.target.value } : m,
                                ),
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => setMeasures((v) => v.filter((_, i) => i !== index))}
                        >
                          Remover medida
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setMeasures((v) => [
                          ...v,
                          { name: '', quantity: '', unit: 'g', provenance: '' },
                        ])
                      }
                    >
                      Adicionar medida caseira
                    </button>
                    <div
                      className="row wrap"
                      style={{ justifyContent: 'flex-start', marginTop: 16 }}
                    >
                      <button disabled={busy}>Salvar alimento</button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEditingFood(undefined)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </section>
              )}
              <div className="exercise-grid" style={{ marginTop: 24 }}>
                {foods.map((food) => (
                  <article className="card" key={food.id}>
                    <span className="badge">{food.ownerId ? 'Personalizado' : 'Fonte global'}</span>
                    <h3 style={{ marginTop: 14 }}>{food.name}</h3>
                    <p className="muted small">
                      {food.preparation} • por 100 {food.referenceUnit}
                    </p>
                    <p className="small">
                      Energia: {withUnit(food.nutrients.energy_kcal, 'kcal')}
                      <br />
                      Proteínas: {withUnit(food.nutrients.protein_g, 'g')}
                      <br />
                      Carboidratos: {withUnit(food.nutrients.carbohydrate_g, 'g')}
                      <br />
                      Lipídios: {withUnit(food.nutrients.fat_g, 'g')}
                    </p>
                    <details>
                      <summary>Procedência e nutrientes</summary>
                      <p className="small muted">{food.provenance.source}</p>
                      {Object.entries(food.nutrients).map(([key, value]) => (
                        <p className="small" key={key}>
                          {macroNames[key] ?? key}: {format(value)}
                        </p>
                      ))}
                      {food.measures.map((m) => (
                        <p className="small" key={m.id}>
                          {m.name}: {m.quantity} {m.unit} • {m.provenance}
                        </p>
                      ))}
                    </details>
                    {food.ownerId && data.enabled && (
                      <div className="row wrap" style={{ marginTop: 12 }}>
                        <button
                          className="secondary"
                          onClick={() => {
                            if (food.provenance.type === 'RECIPE') {
                              setRecipeSource(food);
                              setRecipe(
                                (food.provenance.ingredients ?? []).map((i) => ({
                                  ...simple(i),
                                  substitutions: [],
                                })),
                              );
                              setTab('recipes');
                            } else {
                              setEditingFood(food);
                              setMeasures(
                                food.measures.map((m) => ({
                                  name: m.name,
                                  quantity: m.quantity,
                                  unit: m.unit as 'g' | 'ml',
                                  provenance: m.provenance,
                                })),
                              );
                            }
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => action(`foods/${food.id}/status`, { active: false })}
                        >
                          Desativar
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {!foodMatches.length && (
                <p className="muted" style={{ marginTop: 20 }}>
                  Nenhum alimento encontrado. Cadastre um rótulo real para começar.
                </p>
              )}
            </>
          )}
          {tab === 'recipes' && (
            <section className="card">
              <h2>{recipeSource ? 'Variação da receita' : 'Receita por ingredientes'}</h2>
              <p className="muted small">
                Informe o rendimento final medido. Não há conversão automática entre massa e volume.
              </p>
              {!data.enabled ? (
                <p>Habilitação nutricional verificada necessária.</p>
              ) : (
                <form
                  key={recipeSource?.id ?? 'new-recipe'}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action('foods/recipe', {
                      name: f.get('name'),
                      yieldQuantity: String(f.get('yieldQuantity')),
                      yieldUnit: f.get('yieldUnit'),
                      provenance: f.get('provenance'),
                      ingredients: recipe.map(simple),
                    });
                  }}
                >
                  <label>
                    Nome da receita
                    <input
                      name="name"
                      defaultValue={recipeSource ? recipeSource.name + ' (variação)' : ''}
                      required
                      minLength={2}
                      maxLength={200}
                    />
                  </label>
                  <div className="set-grid" style={{ marginTop: 18 }}>
                    <label>
                      Rendimento final
                      <input
                        name="yieldQuantity"
                        defaultValue={recipeSource?.provenance.yieldQuantity}
                        type="number"
                        required
                        min="0.0001"
                        max="1000000"
                        step="0.0001"
                      />
                    </label>
                    <label>
                      Unidade
                      <select
                        name="yieldUnit"
                        defaultValue={recipeSource?.provenance.yieldUnit ?? 'g'}
                      >
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                      </select>
                    </label>
                  </div>
                  <ItemRows items={recipe} foods={foods} onChange={setRecipe} />
                  <label>
                    Fonte / autoria
                    <textarea name="provenance" required minLength={3} maxLength={1000} />
                  </label>
                  <button disabled={busy || !recipe.length} style={{ marginTop: 20 }}>
                    Calcular e salvar receita
                  </button>
                </form>
              )}
            </section>
          )}
          {tab === 'plans' && (
            <>
              {data.enabled && !version && (
                <form
                  className="card row wrap"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action('nutrition/create', {
                      name: new FormData(e.currentTarget).get('name'),
                    });
                  }}
                >
                  <label style={{ flex: 1 }}>
                    Nome do plano / planejamento
                    <input name="name" required minLength={2} maxLength={150} />
                  </label>
                  <button disabled={busy}>Criar planejamento</button>
                </form>
              )}
              {!version && (
                <div className="exercise-grid program-library" style={{ marginTop: 24 }}>
                  {data.own.map((p) => (
                    <section className="card" key={p.id}>
                      <h3>{p.name}</h3>
                      {p.versions.map((v) => (
                        <button
                          key={v.id}
                          className="secondary full"
                          style={{ marginTop: 10 }}
                          onClick={() => select(v)}
                        >
                          Versão {v.number} • {v.publishedAt ? 'Publicada' : 'Rascunho'}
                        </button>
                      ))}
                    </section>
                  ))}
                </div>
              )}
              {data.archived?.length ? (
                <section className="card" style={{ marginTop: 24 }}>
                  <h2>Planos anteriores</h2>
                  {data.archived.map((a) => (
                    <button
                      className="secondary"
                      key={a.version.id}
                      onClick={() => select(a.version)}
                    >
                      {a.version.plan?.name} • v{a.version.number}
                    </button>
                  ))}
                </section>
              ) : null}
              {version && (
                <section className="card nutrition-builder" style={{ marginTop: 24 }}>
                  <div className="editor-context">
                    <button
                      className="secondary"
                      onClick={() => {
                        if (!dirty || window.confirm('Sair sem salvar as alterações?')) {
                          setVersion(undefined);
                          setDirty(false);
                        }
                      }}
                    >
                      <ArrowLeft size={16} /> Voltar aos planos
                    </button>
                    <span className="badge">
                      {version.publishedAt
                        ? 'Publicado'
                        : dirty
                          ? 'Alterações não salvas'
                          : 'Rascunho salvo'}
                    </span>
                  </div>
                  <h2 className="editor-title">
                    {data.own.find((p) => p.versions.some((v) => v.id === version.id))?.name ??
                      version.plan?.name ??
                      'Plano alimentar'}
                  </h2>
                  <div className="row wrap">
                    <h3>Versão {version.number}</h3>
                    {version.publishedAt &&
                      data.enabled &&
                      data.own.some((p) => p.versions.some((v) => v.id === version.id)) && (
                        <button
                          disabled={busy}
                          onClick={() => action(`nutrition/${version.id}/revise`, {})}
                        >
                          Criar revisão
                        </button>
                      )}
                  </div>
                  {version.publishedAt ? (
                    <>
                      <p>{version.objective}</p>
                      <p>{version.notes}</p>
                      {version.meals.map((meal, i) => (
                        <section className="link-card" key={meal.id ?? i}>
                          <h3>
                            {meal.name} {meal.time}
                          </h3>
                          <p>{meal.notes}</p>
                          {meal.items.map((item, i) => (
                            <p key={i}>
                              {item.snapshot?.name ?? foods.find((f) => f.id === item.foodId)?.name}{' '}
                              • {item.quantity} {item.unit}
                              {item.snapshot?.measure
                                ? ` (${item.snapshot.measure.enteredQuantity} ${item.snapshot.measure.name})`
                                : ''}
                            </p>
                          ))}
                          <NutrientSummary values={total(meal.items)} />
                        </section>
                      ))}
                      <h3>Totais estimados do plano</h3>
                      <NutrientSummary values={total(version.meals.flatMap((m) => m.items))} />
                    </>
                  ) : (
                    <>
                      <label>
                        Objetivo
                        <input
                          value={draft.objective}
                          maxLength={1000}
                          onChange={(e) =>
                            mutate((v) => {
                              v.objective = e.target.value;
                            })
                          }
                        />
                      </label>
                      <label style={{ marginTop: 18 }}>
                        Orientações
                        <textarea
                          value={draft.notes}
                          maxLength={3000}
                          onChange={(e) =>
                            mutate((v) => {
                              v.notes = e.target.value;
                            })
                          }
                        />
                      </label>
                      <div className="quick-meals">
                        <span className="muted small">Adicionar refeição rápida</span>
                        {['Café da manhã', 'Almoço', 'Lanche', 'Jantar'].map((name) => (
                          <button
                            key={name}
                            className="secondary"
                            onClick={() => {
                              mutate((v) => {
                                v.meals.push({ name, time: null, notes: '', items: [] });
                              });
                              setActiveMeal(draft.meals.length);
                            }}
                          >
                            <Plus size={14} />
                            {name}
                          </button>
                        ))}
                      </div>
                      <label className="plan-food-search">
                        <Search size={16} /> Buscar alimento no catálogo
                        <input
                          placeholder="Digite um alimento para buscar…"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                        />
                      </label>
                      <div className="builder-tabs" role="tablist" aria-label="Refeições do plano">
                        {draft.meals.map((meal, i) => (
                          <button
                            key={i}
                            role="tab"
                            aria-selected={i === activeMeal}
                            aria-controls={'meal-panel-' + i}
                            id={'meal-tab-' + i}
                            className={activeMeal === i ? 'selected' : 'secondary'}
                            onClick={() => setActiveMeal(i)}
                          >
                            <Utensils size={16} />
                            {meal.name}
                            <span>{meal.time ?? 'Sem horário'}</span>
                          </button>
                        ))}
                      </div>
                      {!draft.meals.length && (
                        <div className="builder-empty">
                          <Utensils size={26} />
                          <h3>Como será seu dia?</h3>
                          <p>
                            Adicione uma refeição acima ou crie uma personalizada abaixo. Depois
                            escolha os alimentos e quantidades.
                          </p>
                        </div>
                      )}
                      {draft.meals.map((meal, mi) =>
                        mi !== activeMeal ? null : (
                          <section
                            className="card meal-builder-panel"
                            key={mi}
                            role="tabpanel"
                            id={'meal-panel-' + mi}
                            aria-labelledby={'meal-tab-' + mi}
                            style={{ marginTop: 20 }}
                          >
                            <div className="row wrap">
                              <label>
                                Refeição
                                <input
                                  value={meal.name}
                                  maxLength={100}
                                  onChange={(e) =>
                                    mutate((v) => {
                                      v.meals[mi].name = e.target.value;
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Horário sugerido
                                <input
                                  type="time"
                                  value={meal.time ?? ''}
                                  onChange={(e) =>
                                    mutate((v) => {
                                      v.meals[mi].time = e.target.value || null;
                                    })
                                  }
                                />
                              </label>
                              <button
                                className="secondary"
                                onClick={() => {
                                  mutate((v) => {
                                    v.meals.push(structuredClone(meal));
                                  });
                                  setActiveMeal(draft.meals.length);
                                }}
                              >
                                Duplicar refeição
                              </button>
                              <button
                                className="danger"
                                onClick={() => {
                                  mutate((v) => {
                                    v.meals.splice(mi, 1);
                                  });
                                  setActiveMeal(Math.max(0, mi - 1));
                                }}
                              >
                                Remover refeição
                              </button>
                            </div>
                            <label style={{ marginTop: 16 }}>
                              Observações
                              <textarea
                                value={meal.notes}
                                maxLength={1000}
                                onChange={(e) =>
                                  mutate((v) => {
                                    v.meals[mi].notes = e.target.value;
                                  })
                                }
                              />
                            </label>
                            <ItemRows
                              foods={foods}
                              matchingIds={foodMatches}
                              items={meal.items}
                              onChange={(items) =>
                                mutate((v) => {
                                  v.meals[mi].items = items;
                                })
                              }
                            />
                            {meal.items.map((item, ii) => (
                              <details key={ii}>
                                <summary>
                                  Substituições orientadas:{' '}
                                  {foods.find((f) => f.id === item.foodId)?.name}
                                </summary>
                                <ItemRows
                                  foods={foods}
                                  items={item.substitutions.map((i) => ({
                                    ...i,
                                    substitutions: [],
                                  }))}
                                  onChange={(items) =>
                                    mutate((v) => {
                                      v.meals[mi].items[ii].substitutions = items.map(simple);
                                    })
                                  }
                                />
                              </details>
                            ))}
                            <NutrientSummary values={total(meal.items)} />
                          </section>
                        ),
                      )}
                      <button
                        className="secondary"
                        style={{ marginTop: 20 }}
                        onClick={() => {
                          mutate((v) => {
                            v.meals.push({
                              name: `Refeição ${v.meals.length + 1}`,
                              time: null,
                              notes: '',
                              items: [],
                            });
                          });
                          setActiveMeal(draft.meals.length);
                        }}
                      >
                        Adicionar refeição
                      </button>
                      <div className="editor-savebar" style={{ marginTop: 24 }}>
                        {data.role === 'PROFESSIONAL' && (
                          <>
                            <h3>Atribuir a pacientes vinculados</h3>
                            {data.students.map((s) => (
                              <label className="consent" key={s.id}>
                                <input
                                  type="checkbox"
                                  checked={targets.includes(s.id)}
                                  onChange={(e) =>
                                    setTargets((v) =>
                                      e.target.checked
                                        ? [...v, s.id]
                                        : v.filter((id) => id !== s.id),
                                    )
                                  }
                                />
                                {s.profile.name}
                              </label>
                            ))}
                          </>
                        )}
                        <div
                          className="row wrap"
                          style={{ justifyContent: 'flex-start', marginTop: 16 }}
                        >
                          <button
                            disabled={busy}
                            onClick={() =>
                              action(`nutrition/${version.id}/save`, {
                                revision: version.draftRevision,
                                data: draft,
                              })
                            }
                          >
                            Salvar rascunho
                          </button>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={async () => {
                              const r = await action(`nutrition/${version.id}/save`, {
                                revision: version.draftRevision,
                                data: draft,
                              });
                              if (r)
                                await action(`nutrition/${version.id}/publish`, {
                                  revision: r.revision,
                                  studentIds: targets,
                                });
                            }}
                          >
                            Salvar e publicar
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </section>
              )}
            </>
          )}
          {tab === 'diary' && (
            <>
              <section className="card row wrap">
                <label>
                  Data
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                {data.role === 'PROFESSIONAL' && (
                  <label>
                    Paciente
                    <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                      <option value="">Selecione um paciente autorizado</option>
                      {data.students.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.profile.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {data.role === 'STUDENT' && (
                  <button
                    onClick={() =>
                      setLogging({
                        id: crypto.randomUUID(),
                        revision: 0,
                        mealName: 'Refeição',
                        prescribedMealId: null,
                        notes: '',
                        items: [],
                      })
                    }
                  >
                    Registrar consumo
                  </button>
                )}
              </section>
              {data.role === 'STUDENT' && (
                <section style={{ marginTop: 24 }}>
                  <h2>Alimentação planejada</h2>
                  {!activePlans.length && (
                    <p className="muted">
                      Nenhum plano ativo. Você pode manter seu diário independente.
                    </p>
                  )}
                  {activePlans.map((a) => (
                    <section className="card" key={a.version.id} style={{ marginBottom: 18 }}>
                      <h3>
                        {a.version.plan?.name} • v{a.version.number}
                      </h3>
                      <p>{a.version.notes}</p>
                      {a.version.meals.map((meal, mi) => (
                        <article className="link-card" key={meal.id ?? mi}>
                          <h3>
                            {meal.name} {meal.time}
                          </h3>
                          <p>{meal.notes}</p>
                          {meal.items.map((item, i) => (
                            <div key={i}>
                              <p>
                                {item.snapshot?.name} • {item.quantity} {item.unit}
                                {item.snapshot?.measure
                                  ? ` (${item.snapshot.measure.enteredQuantity} ${item.snapshot.measure.name})`
                                  : ''}
                              </p>
                              {item.substitutions.length > 0 && (
                                <p className="muted small">
                                  Alternativas:{' '}
                                  {item.substitutions
                                    .map(
                                      (s) =>
                                        `${s.snapshot?.name ?? foods.find((f) => f.id === s.foodId)?.name ?? 'Alternativa'} — ${s.quantity} ${s.unit}`,
                                    )
                                    .join('; ')}
                                  . As alternativas não são automaticamente equivalentes.
                                </p>
                              )}
                            </div>
                          ))}
                          <NutrientSummary values={total(meal.items)} />
                          <button
                            className="secondary"
                            onClick={() => {
                              const existing = daily?.logs.find(
                                (l) => l.prescribedMealId === meal.id,
                              );
                              setLogging({
                                id: existing?.id ?? crypto.randomUUID(),
                                revision: existing?.revision ?? 0,
                                mealName: meal.name,
                                prescribedMealId: meal.id ?? null,
                                notes: existing?.notes ?? '',
                                allowedItems: meal.items.flatMap((i) => [
                                  i,
                                  ...(i.substitutions ?? []).map((a) => ({
                                    ...a,
                                    substitutions: [],
                                  })),
                                ]),
                                items: (existing?.items ?? meal.items).map((i) => ({
                                  ...simple(i),
                                  substitutions: [],
                                  snapshot: i.snapshot,
                                })),
                              });
                            }}
                          >
                            {daily?.logs.some((l) => l.prescribedMealId === meal.id && l.consumedAt)
                              ? 'Revisar consumo'
                              : 'Marcar realizada / registrar consumo'}
                          </button>
                        </article>
                      ))}
                    </section>
                  ))}
                </section>
              )}
              {logging && data.role === 'STUDENT' && (
                <section className="card" style={{ marginTop: 24 }}>
                  <h2>Consumo real</h2>
                  <p className="muted small">
                    Ajuste o que realmente consumiu. Isso não altera o plano prescrito.
                  </p>
                  <label>
                    Refeição
                    <input
                      value={logging.mealName}
                      maxLength={100}
                      onChange={(e) =>
                        setLogging((v) => (v ? { ...v, mealName: e.target.value } : v))
                      }
                    />
                  </label>
                  <ItemRows
                    foods={[
                      ...foods,
                      ...[...logging.items, ...(logging.allowedItems ?? [])]
                        .filter((i) => i.snapshot && !foods.some((f) => f.id === i.foodId))
                        .map((i) => ({
                          id: i.foodId,
                          name: i.snapshot!.name,
                          referenceUnit: i.unit,
                          nutrients: i.snapshot!.nutrients,
                          provenance: i.snapshot!.provenance,
                          measures: [],
                        })),
                    ].filter(
                      (f, index, all) => all.findIndex((other) => other.id === f.id) === index,
                    )}
                    items={logging.items}
                    onChange={(items) => setLogging((v) => (v ? { ...v, items } : v))}
                  />
                  <label>
                    Observações
                    <textarea
                      value={logging.notes}
                      maxLength={2000}
                      onChange={(e) => setLogging((v) => (v ? { ...v, notes: e.target.value } : v))}
                    />
                  </label>
                  <button
                    disabled={busy || !logging.items.length}
                    style={{ marginTop: 18 }}
                    onClick={async () => {
                      const r = await action('meals/save', {
                        id: logging.id,
                        revision: logging.revision,
                        mealName: logging.mealName,
                        prescribedMealId: logging.prescribedMealId,
                        notes: logging.notes,
                        date,
                        consumed: true,
                        items: logging.items.map(simple),
                      });
                      if (r) setLogging(undefined);
                    }}
                  >
                    Salvar consumo
                  </button>
                  <button
                    className="secondary"
                    style={{ marginLeft: 10 }}
                    onClick={() => setLogging(undefined)}
                  >
                    Cancelar
                  </button>
                </section>
              )}
              <section className="card" style={{ marginTop: 24 }}>
                <h2>Alimentação registrada</h2>
                {daily?.logs.map((log) => (
                  <article className="link-card" key={log.id}>
                    <h3>
                      {log.mealName} • {log.consumedAt ? 'Realizada' : 'Não realizada'}
                    </h3>
                    {log.items.map((i, index) => (
                      <p key={index}>
                        {i.snapshot.name} — {i.quantity} {i.unit}
                      </p>
                    ))}
                    <p>{log.notes}</p>
                    <NutrientSummary values={total(log.items)} />
                    {log.differences && (
                      <p className="small muted">
                        Diferenças consumido − planejado: energia{' '}
                        {withUnit(log.differences.energy_kcal, 'kcal')} • proteínas{' '}
                        {withUnit(log.differences.protein_g, 'g')} • carboidratos{' '}
                        {withUnit(log.differences.carbohydrate_g, 'g')} • lipídios{' '}
                        {withUnit(log.differences.fat_g, 'g')}. Não representa avaliação moral dos
                        alimentos.
                      </p>
                    )}
                    {log.prescribedMealId && (
                      <span className="badge">
                        Vinculada à prescrição • consumo preservado separadamente
                      </span>
                    )}
                    {data.role === 'STUDENT' && (
                      <button
                        className="secondary"
                        style={{ marginTop: 12 }}
                        onClick={() =>
                          setLogging({
                            id: log.id,
                            revision: log.revision,
                            mealName: log.mealName,
                            prescribedMealId: log.prescribedMealId,
                            notes: log.notes,
                            items: log.items.map((i) => ({
                              ...simple(i),
                              substitutions: [],
                              snapshot: i.snapshot,
                            })),
                          })
                        }
                      >
                        Editar registro
                      </button>
                    )}
                    {data.role === 'PROFESSIONAL' && (
                      <form
                        style={{ marginTop: 12 }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action(`meals/${log.id}/reply`, {
                            text: new FormData(e.currentTarget).get('text'),
                          });
                        }}
                      >
                        <label>
                          Feedback nutricional
                          <textarea name="text" required maxLength={2000} />
                        </label>
                        <button style={{ marginTop: 10 }} disabled={busy}>
                          Enviar comentário
                        </button>
                      </form>
                    )}
                    {log.replies.map((r) => (
                      <p className="message" key={r.id}>
                        {r.text}
                      </p>
                    ))}
                  </article>
                ))}
                {!daily?.logs.length && <p className="muted">Sem registros nesta data.</p>}
                <h3>Totais consumidos estimados</h3>
                <NutrientSummary values={daily?.totals ?? {}} />
                {daily?.macros && (
                  <p className="small muted">
                    Distribuição energética estimada: proteínas {format(daily.macros[0])}% •
                    carboidratos {format(daily.macros[1])}% • lipídios {format(daily.macros[2])}%.
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </WorkflowShell>
  );
}
function NutrientSummary({ values }: { values: Nutrients }) {
  return (
    <p className="muted small">
      Estimativas: energia {withUnit(values.energy_kcal, 'kcal')} • proteínas{' '}
      {withUnit(values.protein_g, 'g')} • carboidratos {withUnit(values.carbohydrate_g, 'g')} •
      lipídios {withUnit(values.fat_g, 'g')}. Valores ausentes não são considerados zero.
    </p>
  );
}
function ItemRows({
  items,
  foods,
  onChange,
  matchingIds,
}: {
  matchingIds?: string[];
  items: Item[];
  foods: Pick<Food, 'id' | 'name' | 'referenceUnit' | 'measures'>[];
  onChange: (items: Item[]) => void;
}) {
  const options = matchingIds
    ? foods.filter(
        (food) => matchingIds.includes(food.id) || items.some((item) => item.foodId === food.id),
      )
    : foods;
  const newFood = matchingIds ? foods.find((food) => matchingIds.includes(food.id)) : foods[0];
  return (
    <div className="food-item-rows" style={{ margin: '18px 0' }}>
      {items.map((item, index) => (
        <div className="set-grid" key={index} style={{ marginBottom: 14 }}>
          <label>
            Alimento
            <select
              aria-label="Alimento"
              value={item.foodId}
              onChange={(e) =>
                onChange(
                  items.map((v, i) =>
                    i === index
                      ? {
                          ...v,
                          foodId: e.target.value,
                          unit: foods.find((f) => f.id === e.target.value)?.referenceUnit ?? 'g',
                          snapshot: undefined,
                          measureId: undefined,
                        }
                      : v,
                  ),
                )
              }
            >
              {options.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantidade
            <input
              type="number"
              min="0.0001"
              max="1000000"
              step="0.0001"
              value={item.quantity}
              onChange={(e) =>
                onChange(
                  items.map((v, i) => (i === index ? { ...v, quantity: e.target.value } : v)),
                )
              }
            />
          </label>
          <label>
            Unidade
            <select
              aria-label="Unidade da quantidade"
              value={item.measureId ? 'measure:' + item.measureId : item.unit}
              onChange={(e) =>
                onChange(
                  items.map((v, i) =>
                    i === index
                      ? {
                          ...v,
                          unit: e.target.value === 'ml' ? 'ml' : 'g',
                          measureId: e.target.value.startsWith('measure:')
                            ? e.target.value.slice(8)
                            : undefined,
                        }
                      : v,
                  ),
                )
              }
            >
              <option value="g">g</option>
              <option value="ml">ml</option>
              {foods
                .find((f) => f.id === item.foodId)
                ?.measures?.map((m) => (
                  <option key={m.id} value={'measure:' + m.id}>
                    {m.name} ({m.quantity} {m.unit})
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="danger"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={!newFood}
        onClick={() => {
          const f = newFood!;
          onChange([
            ...items,
            { foodId: f.id, quantity: '100', unit: f.referenceUnit, substitutions: [] },
          ]);
        }}
      >
        Adicionar alimento
      </button>
    </div>
  );
}
