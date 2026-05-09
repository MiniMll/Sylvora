export function Spinner({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      color: 'var(--text2)',
      animation: 'fadeIn 0.3s ease',
    }}>
      <div style={{
        position: 'relative',
        width: 36,
        height: 36,
      }}>
        {/* Track */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '3px solid var(--border)',
        }} />
        {/* Spinner */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '3px solid transparent',
          borderTopColor: '#5b4cff',
          animation: 'spin 0.75s cubic-bezier(0.4,0,0.2,1) infinite',
        }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.01em' }}>{texto}</div>
    </div>
  )
}
