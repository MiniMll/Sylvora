export function Spinner({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text2)' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTop: '3px solid #5b4cff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: 13 }}>{texto}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}