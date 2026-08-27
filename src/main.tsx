import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicEntry } from './PublicEntry';
import './styles/app.css';

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="fatal-error"><h1>The workspace needs a fresh start.</h1><p>Your saved board has not been intentionally cleared. Reload the page to try again.</p><button className="button primary" onClick={() => window.location.reload()}>Reload workspace</button><p>If the problem persists, keep your browser data intact and report the issue.</p></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode><AppErrorBoundary><PublicEntry /></AppErrorBoundary></StrictMode>);
