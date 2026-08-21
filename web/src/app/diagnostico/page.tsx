import { getLocales, getPreguntas, agruparPorCategoria } from '@/services';

export const dynamic = 'force-dynamic';

export default async function DiagnosticoPage() {
  let locales: Awaited<ReturnType<typeof getLocales>> = [];
  let preguntas: Awaited<ReturnType<typeof getPreguntas>> = [];
  let errorLocales: string | null = null;
  let errorPreguntas: string | null = null;

  try { locales = await getLocales(); }
  catch (e) { errorLocales = String(e); }

  try { preguntas = await getPreguntas(); }
  catch (e) { errorPreguntas = String(e); }

  const categorias = agruparPorCategoria(preguntas);
  const multimarca = preguntas.filter(p => p.marca === 'Multimarca').length;
  const causa      = preguntas.filter(p => p.marca === 'Causa').length;
  const localesCausa = locales.filter(l => l.isCausa).length;
  const localesMulti = locales.filter(l => !l.isCausa).length;

  return (
    <main style={{ padding: 24, fontFamily: 'monospace', fontSize: 14, maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, marginBottom: 24 }}>🔍 Diagnóstico — Ausitoria App</h1>

      <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, borderRadius: 8 }}>
        <h2>Locales {errorLocales ? '❌' : `✅ ${locales.length} cargados`}</h2>
        {errorLocales && <p style={{ color: 'red' }}>{errorLocales}</p>}
        {!errorLocales && (
          <>
            <p>SushiPop: {localesMulti} | Causa: {localesCausa}</p>
            <ul style={{ columns: 2, marginTop: 8 }}>
              {locales.map(l => (
                <li key={l.nombre}>{l.nombre} {l.isCausa ? '(Causa)' : ''}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, borderRadius: 8 }}>
        <h2>Preguntas {errorPreguntas ? '❌' : `✅ ${preguntas.length} totales`}</h2>
        {errorPreguntas && <p style={{ color: 'red' }}>{errorPreguntas}</p>}
        {!errorPreguntas && (
          <>
            <p>Multimarca: {multimarca} | Causa: {causa}</p>
            <table style={{ marginTop: 8, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', paddingRight: 16 }}>Categoría</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>Preguntas</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map(c => (
                  <tr key={c.name}>
                    <td style={{ paddingRight: 16, paddingTop: 4 }}>{c.name}</td>
                    <td style={{ textAlign: 'right', paddingTop: 4 }}>{c.questions.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <p style={{ color: '#888', fontSize: 12 }}>
        Generado: {new Date().toLocaleString('es-AR')}
      </p>
    </main>
  );
}
