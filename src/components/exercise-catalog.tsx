'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Dumbbell, Search, Star, ArrowLeft, Plus } from 'lucide-react';
import { Logo } from './logo';
const equipmentName: Record<string, string> = {
  Barbell: 'Barra',
  'SZ-Bar': 'Barra W',
  Dumbbell: 'Halter',
  'Gym mat': 'Colchonete',
  'Swiss Ball': 'Bola suíça',
  'Pull-up bar': 'Barra fixa',
  'none (bodyweight exercise)': 'Peso corporal',
  Bench: 'Banco',
  'Incline bench': 'Banco inclinado',
  'Resistance band': 'Elástico',
  'Cable machine': 'Máquina de cabos',
};
const labelEquipment = (name: string) => equipmentName[name] ?? name;
const categoryName: Record<string, string> = {
  STRENGTH: 'Força',
  CARDIO: 'Cardio',
  MOBILITY: 'Mobilidade',
  OTHER: 'Outro',
  Abs: 'Abdômen',
  Arms: 'Braços',
  Back: 'Costas',
  Calves: 'Panturrilhas',
  Chest: 'Peitoral',
  Legs: 'Pernas',
  Shoulders: 'Ombros',
  Cardio: 'Cardio',
};
type Taxon = { id: string; name: string; alternateName?: string | null };
function safeHttp(value?: string) {
  try {
    const url = new URL(value ?? '');
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
type Credit = {
  author: string;
  authorUrl?: string;
  sourceUrl?: string;
  derivativeSourceUrl?: string;
  title?: string;
  license: string;
  licenseUrl: string;
  name?: string;
};
type Exercise = {
  id: string;
  name: string;
  source: string;
  ownerId: string | null;
  active: boolean;
  aliases: string[];
  description: string;
  instructions: string;
  category: string;
  sourceCategory: string | null;
  movementType: string | null;
  technicalLevel: string | null;
  muscles: { muscleId: string; role: string; muscle: Taxon }[];
  equipment: { equipmentId: string; equipment: Taxon }[];
  favorites: { userId: string }[];
  provenance: {
    source: string;
    sourceUrl?: string;
    changes?: string;
    displayLanguage?: string;
    instructionsLanguage?: string;
    media?: {
      type: string;
      url: string;
      aiGenerated?: boolean;
      credit: Credit;
      duration?: string | null;
    }[];
    base?: Credit;
    translations?: Credit[];
  };
};
type Result = { items: Exercise[]; total: number; page: number; pages: number };
type Meta = {
  muscles: Taxon[];
  equipment: Taxon[];
  trainerEnabled: boolean;
  snapshot: { count: number; revision: string; notes: string[] };
  jobs?: {
    id: string;
    status: string;
    imported: number;
    updated: number;
    unchanged: number;
    startedAt: string;
  }[];
};
export function ExerciseCatalog({ role }: { role: string }) {
  const [meta, setMeta] = useState<Meta>();
  const [result, setResult] = useState<Result>();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Exercise>();
  const [editing, setEditing] = useState<Exercise | null | undefined>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const detail = useRef<HTMLElement>(null);
  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/exercises/meta');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMeta(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão.');
    }
  }, []);
  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    async function load() {
      try {
        const params = new URLSearchParams({
          q: query,
          page: String(page),
          favorite: String(favorites),
          includeInactive: String(inactive),
        });
        if (muscle) params.set('muscle', muscle);
        if (equipment) params.set('equipment', equipment);
        const res = await fetch(`/api/exercises?${params}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setResult(data);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Falha ao carregar.');
      }
    }
    void load();
    return () => controller.abort();
  }, [query, muscle, equipment, favorites, inactive, page, refresh]);
  useEffect(() => {
    if (selected) detail.current?.focus();
  }, [selected]);
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message);
      setRefresh((v) => v + 1);
      await loadMeta();
      if (path.endsWith('/update') || path === 'exercises/create') setEditing(undefined);
      if (selected && path.startsWith(`exercises/${selected.id}/`)) {
        const res = await fetch(`/api/exercises/${selected.id}`);
        if (res.ok) setSelected(await res.json());
        else setSelected(undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  }
  async function view(id: string) {
    setError('');
    try {
      const res = await fetch(`/api/exercises/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelected(data);
      setEditing(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão.');
    }
  }
  return (
    <main className="main">
      <header className="row wrap">
        <Logo />
        <Link className="button secondary" href="/painel">
          <ArrowLeft size={16} /> Meu espaço
        </Link>
      </header>
      <section style={{ marginTop: 44, marginBottom: 28 }}>
        <p className="eyebrow">Biblioteca de exercícios</p>
        <div className="row wrap">
          <div>
            <h1 style={{ fontSize: 38 }}>Encontre seu próximo movimento.</h1>
            <p className="muted">
              Exercícios do catálogo wger e seus favoritos. Instruções e procedência sempre
              visíveis.
            </p>
          </div>
          {meta?.trainerEnabled && (
            <button
              onClick={() => {
                setEditing(null);
                setSelected(undefined);
              }}
            >
              <Plus size={17} /> Criar exercício
            </button>
          )}
        </div>
      </section>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <section className="card stack" style={{ marginBottom: 24 }}>
        <form
          className="row wrap"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(String(new FormData(e.currentTarget).get('q') ?? ''));
            setPage(1);
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="q">Nome ou nome alternativo</label>
            <input id="q" name="q" maxLength={100} placeholder="Busque um exercício…" />
          </div>
          <button style={{ marginTop: 24 }}>
            <Search size={17} /> Buscar
          </button>
        </form>
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="muscle">Músculo</label>
            <select
              id="muscle"
              value={muscle}
              onChange={(e) => {
                setMuscle(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os músculos</option>
              {meta?.muscles.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="equipment">Equipamento</label>
            <select
              id="equipment"
              value={equipment}
              onChange={(e) => {
                setEquipment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os equipamentos</option>
              {meta?.equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {labelEquipment(e.name)}
                </option>
              ))}
            </select>
          </div>
          <button
            className={favorites ? '' : 'secondary'}
            onClick={() => {
              setFavorites(!favorites);
              setPage(1);
            }}
            aria-pressed={favorites}
          >
            <Star size={17} /> Favoritos
          </button>
          {(role === 'ADMIN' || meta?.trainerEnabled) && (
            <label className="consent" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={inactive}
                onChange={(e) => {
                  setInactive(e.target.checked);
                  setPage(1);
                }}
              />{' '}
              Incluir desativados
            </label>
          )}
        </div>
      </section>
      {editing !== undefined && meta && (
        <ExerciseEditor
          exercise={editing}
          meta={meta}
          busy={busy}
          onClose={() => setEditing(undefined)}
          onSave={(body) =>
            action(editing ? `exercises/${editing.id}/update` : 'exercises/create', body)
          }
        />
      )}
      {selected && (
        <section
          className="card"
          ref={detail}
          tabIndex={-1}
          style={{ marginBottom: 24 }}
          aria-label="Detalhes do exercício"
        >
          <div className="row wrap">
            <div>
              <span className="badge">
                {selected.source === 'WGER' ? 'Catálogo global • wger' : 'Personalizado • privado'}
              </span>
              <h2 style={{ marginTop: 18 }}>{selected.name}</h2>
            </div>
            <button className="secondary" onClick={() => setSelected(undefined)}>
              Fechar detalhes
            </button>
          </div>
          {selected.aliases.length > 0 && (
            <p className="muted small">Também conhecido como: {selected.aliases.join(', ')}</p>
          )}
          <p className="muted small">
            {categoryName[selected.sourceCategory ?? selected.category] ?? selected.sourceCategory}{' '}
            • {selected.active ? 'Ativo' : 'Desativado'}
          </p>
          {(selected.provenance.displayLanguage || selected.provenance.instructionsLanguage) && (
            <p className="small muted">
              Nome:{' '}
              {selected.provenance.displayLanguage === 'pt'
                ? 'português'
                : selected.provenance.displayLanguage === 'en'
                  ? 'inglês'
                  : selected.provenance.displayLanguage}{' '}
              · Instruções:{' '}
              {selected.provenance.instructionsLanguage === 'pt'
                ? 'português'
                : selected.provenance.instructionsLanguage === 'en'
                  ? 'inglês'
                  : selected.provenance.instructionsLanguage}
              . Conteúdo mantido no idioma da fonte.
            </p>
          )}
          <h3>Instruções da fonte</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>
            {selected.instructions ||
              'A fonte não informa instruções de execução. Consulte um profissional.'}
          </p>
          <div className="dashboard-grid">
            <div>
              <h3>Músculos principais</h3>
              <p className="muted small">
                {selected.muscles
                  .filter((m) => m.role === 'PRIMARY')
                  .map((m) => m.muscle.name)
                  .join(', ') || 'Não informado'}
              </p>
              <h3>Músculos secundários</h3>
              <p className="muted small">
                {selected.muscles
                  .filter((m) => m.role === 'SECONDARY')
                  .map((m) => m.muscle.name)
                  .join(', ') || 'Não informado'}
              </p>
            </div>
            <div>
              <h3>Equipamentos</h3>
              <p className="muted small">
                {selected.equipment.map((e) => labelEquipment(e.equipment.name)).join(', ') ||
                  'Não informado'}
              </p>
              <p className="muted small">
                Tipo de movimento: {selected.movementType || 'não informado'}
                <br />
                Nível técnico: {selected.technicalLevel || 'não informado'}
              </p>
            </div>
          </div>
          {!!selected.provenance.media?.length && (
            <section className="exercise-media-links">
              <h3>Demonstrações na fonte</h3>
              <p className="small muted">
                Imagens e vídeos licenciados, abertos diretamente no wger.
              </p>
              {selected.provenance.media.map((media, index) => (
                <article key={media.url} className="link-card">
                  <a
                    href={safeHttp(media.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: 'underline' }}
                  >
                    Ver {media.type === 'video' ? 'vídeo' : 'imagem'} {index + 1}
                    {media.duration ? ' · ' + media.duration + 's' : ''}
                  </a>
                  <p className="small muted">
                    {media.credit.author || 'Autoria não informada na fonte'} ·{' '}
                    <a
                      href={safeHttp(media.credit.licenseUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {media.credit.license}
                    </a>
                    {media.aiGenerated ? ' · Fonte identifica imagem gerada por IA' : ''}
                  </p>
                </article>
              ))}
            </section>
          )}
          {selected.source === 'WGER' && (
            <div className="code">
              <h3>Fonte e atribuição</h3>
              <p>
                Dados do{' '}
                <a
                  href={safeHttp(selected.provenance.sourceUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'underline' }}
                >
                  wger
                </a>
                . Metadados e créditos mantidos por registro; arquivos de mídia permanecem na fonte.
              </p>
              {[selected.provenance.base, ...(selected.provenance.translations ?? [])]
                .filter(Boolean)
                .map((c, i) => (
                  <p className="small" key={i}>
                    {c?.title || c?.name || 'Registro-base'} •{' '}
                    <a href={safeHttp(c?.authorUrl)} target="_blank" rel="noopener noreferrer">
                      {c?.author || 'Autoria não informada na fonte'}
                    </a>{' '}
                    •{' '}
                    <a
                      href={safeHttp(c?.licenseUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: 'underline' }}
                    >
                      {c?.license}
                    </a>
                    {safeHttp(c?.derivativeSourceUrl) && (
                      <>
                        {' '}
                        •{' '}
                        <a
                          href={safeHttp(c?.derivativeSourceUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Origem da adaptação
                        </a>
                      </>
                    )}
                  </p>
                ))}
              <p className="small">{selected.provenance.changes}</p>
            </div>
          )}
          {(selected.source === 'CUSTOM' || role === 'ADMIN') && (
            <div className="row wrap" style={{ justifyContent: 'flex-start', marginTop: 20 }}>
              {selected.source === 'CUSTOM' && (
                <button
                  className="secondary"
                  onClick={() => {
                    setEditing(selected);
                    setSelected(undefined);
                  }}
                >
                  Editar meu exercício
                </button>
              )}
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  action(`exercises/${selected.id}/status`, { active: !selected.active })
                }
              >
                {selected.active ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          )}
        </section>
      )}
      <div className="row" style={{ marginBottom: 20 }}>
        <h2>{favorites ? 'Seus favoritos' : 'Catálogo'}</h2>
        <span className="muted small" role="status">
          {result ? `${result.total} exercícios` : 'Carregando…'}
        </span>
      </div>
      {result?.total === 0 && (
        <section className="card">
          <p className="muted">
            Nenhum exercício encontrado. Ajuste os filtros ou adicione favoritos ao catálogo.
          </p>
        </section>
      )}
      <div className="exercise-grid">
        {result?.items.map((exercise) => (
          <article className="card" key={exercise.id}>
            <div className="row">
              <span className="icon-tile">
                <Dumbbell />
              </span>
              <button
                className="secondary"
                disabled={busy || !exercise.active}
                aria-label={`${exercise.favorites.length ? 'Remover dos' : 'Adicionar aos'} favoritos: ${exercise.name}`}
                aria-pressed={!!exercise.favorites.length}
                onClick={() =>
                  action(`exercises/${exercise.id}/favorite`, {
                    favorite: !exercise.favorites.length,
                  })
                }
              >
                <Star size={18} fill={exercise.favorites.length ? 'currentColor' : 'none'} />
              </button>
            </div>
            <span className="badge">
              {exercise.source === 'WGER' ? 'wger' : 'Seu exercício'}
              {!exercise.active ? ' • Desativado' : ''}
            </span>
            <h3 style={{ marginTop: 16, minHeight: 42 }}>{exercise.name}</h3>
            <p className="muted small">
              {exercise.equipment.map((e) => labelEquipment(e.equipment.name)).join(', ') ||
                'Equipamento não informado'}
            </p>
            <button className="secondary full" onClick={() => view(exercise.id)}>
              Ver detalhes
            </button>
          </article>
        ))}
      </div>
      {result && result.pages > 1 && (
        <nav className="row" aria-label="Paginação" style={{ marginTop: 24 }}>
          <button className="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span className="small">
            Página {page} de {result.pages}
          </span>
          <button
            className="secondary"
            disabled={page >= result.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </nav>
      )}
      {role === 'ADMIN' && meta && (
        <section className="card" style={{ marginTop: 30 }}>
          <h2>Importações do catálogo</h2>
          <p className="muted small">
            Snapshot oficial com {meta.snapshot.count} exercícios em português. Importar novamente
            preserva favoritos e desativações administrativas.
          </p>
          <p className="code">Versão: {meta.snapshot.revision}</p>
          <button
            disabled={busy}
            onClick={() => action('admin/import-exercises', { confirmed: true })}
          >
            {busy ? 'Aguarde…' : 'Sincronizar snapshot'}
          </button>
          {meta.jobs?.map((job) => (
            <p className="small muted" key={job.id} style={{ marginTop: 16 }}>
              {new Date(job.startedAt).toLocaleString('pt-BR')} •{' '}
              {
                (
                  { SUCCESS: 'Concluída', FAILED: 'Falhou', RUNNING: 'Em andamento' } as Record<
                    string,
                    string
                  >
                )[job.status]
              }{' '}
              • {job.imported} novos / {job.updated} atualizados / {job.unchanged} preservados
            </p>
          ))}
        </section>
      )}
      <p className="muted small" style={{ marginTop: 30 }}>
        Conteúdo da fonte preservado. Nomes científicos dos músculos seguem o catálogo original. A
        biblioteca não gera prescrições nem substitui orientação profissional.
      </p>
    </main>
  );
}
function ExerciseEditor({
  exercise,
  meta,
  busy,
  onClose,
  onSave,
}: {
  exercise: Exercise | null;
  meta: Meta;
  busy: boolean;
  onClose: () => void;
  onSave: (body: unknown) => Promise<void>;
}) {
  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <div className="row wrap">
        <h2>{exercise ? 'Editar exercício personalizado' : 'Novo exercício personalizado'}</h2>
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
      </div>
      <p className="muted small">
        Este registro fica privado no seu catálogo. Não altera os exercícios globais.
      </p>
      <form
        key={exercise?.id ?? 'new'}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void onSave({
            name: f.get('name'),
            aliases: String(f.get('aliases') ?? '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            description: f.get('description'),
            instructions: f.get('instructions'),
            category: f.get('category'),
            movementType: f.get('movementType') || null,
            technicalLevel: f.get('technicalLevel') || null,
            muscleIds: f.getAll('muscleIds'),
            secondaryMuscleIds: f.getAll('secondaryMuscleIds'),
            equipmentIds: f.getAll('equipmentIds'),
          });
        }}
      >
        <div className="field">
          <label htmlFor="exercise-name">Nome</label>
          <input
            id="exercise-name"
            name="name"
            defaultValue={exercise?.name}
            minLength={2}
            maxLength={150}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="aliases">Nomes alternativos, separados por vírgula</label>
          <input
            id="aliases"
            name="aliases"
            defaultValue={exercise?.aliases.join(', ')}
            maxLength={1000}
          />
        </div>
        <div className="dashboard-grid">
          <div className="field">
            <label htmlFor="description">Descrição</label>
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={4000}
              defaultValue={exercise?.description}
            />
          </div>
          <div className="field">
            <label htmlFor="instructions">Instruções de execução</label>
            <textarea
              id="instructions"
              name="instructions"
              rows={3}
              maxLength={6000}
              defaultValue={exercise?.instructions}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="category">Categoria</label>
          <select id="category" name="category" defaultValue={exercise?.category ?? 'OTHER'}>
            {['STRENGTH', 'CARDIO', 'MOBILITY', 'OTHER'].map((c) => (
              <option value={c} key={c}>
                {categoryName[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="dashboard-grid">
          {(['muscleIds', 'secondaryMuscleIds'] as const).map((name, index) => (
            <div className="field" key={name}>
              <label htmlFor={name}>
                {index === 0 ? 'Músculos principais' : 'Músculos secundários'}
              </label>
              <select
                multiple
                id={name}
                name={name}
                defaultValue={exercise?.muscles
                  .filter((m) => m.role === (index === 0 ? 'PRIMARY' : 'SECONDARY'))
                  .map((m) => m.muscleId)}
              >
                {meta.muscles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor="equipmentIds">Equipamentos</label>
          <select
            multiple
            id="equipmentIds"
            name="equipmentIds"
            defaultValue={exercise?.equipment.map((e) => e.equipmentId)}
          >
            {meta.equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {labelEquipment(e.name)}
              </option>
            ))}
          </select>
        </div>
        <p className="small muted">
          Nos seletores de múltiplos itens, use Ctrl/Cmd no computador ou o seletor nativo do
          celular.
        </p>
        <div className="dashboard-grid">
          <div className="field">
            <label htmlFor="movementType">Tipo de movimento (opcional)</label>
            <input
              id="movementType"
              name="movementType"
              maxLength={120}
              defaultValue={exercise?.movementType ?? ''}
            />
          </div>
          <div className="field">
            <label htmlFor="technicalLevel">Nível técnico (opcional)</label>
            <input
              id="technicalLevel"
              name="technicalLevel"
              maxLength={120}
              defaultValue={exercise?.technicalLevel ?? ''}
            />
          </div>
        </div>
        <button disabled={busy}>{busy ? 'Salvando…' : 'Salvar exercício'}</button>
      </form>
    </section>
  );
}
