import { Component } from 'react';

/** Last line of defence: a screen error never leaves a blank white window. */
export default class RootBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'Inter, Arial, sans-serif', color: '#1f2340', background: '#f4f2f9' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h2 style={{ margin: '0 0 8px' }}>Something went wrong</h2>
          <p style={{ color: '#6b6f8a', marginBottom: 18 }}>Your data is safe. Press the button to reload the panel.</p>
          <button style={{ background: '#6d28d9', color: '#fff', border: 0, borderRadius: 12, padding: '12px 22px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }} onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
