import { Component } from "react";

export class EditorErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[NotePane] The editor crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div className="editor-crash" role="alert">
        <h1 className="editor-crash-title">This note could not be displayed</h1>
        <p className="editor-crash-message">
          {String(this.state.error?.message || this.state.error)}
        </p>
        <p className="editor-crash-hint">
          Nothing was written to disk while this message is shown. Reloading reopens the note from
          its last saved state.
        </p>
        <button
          type="button"
          className="editor-crash-reload"
          onClick={() => window.location.reload()}
        >
          Reload window
        </button>
      </div>
    );
  }
}
