"use client";

import React from "react";
import { Disc3 } from "lucide-react";

interface Props  { children: React.ReactNode }
interface State  { hasError: boolean }

export class GridErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Grid render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "80px 20px", gap: 12,
        }}>
          <Disc3 size={36} strokeWidth={1} style={{ color: "#2a1f10" }} />
          <p style={{
            fontFamily: "var(--font-mono)", fontSize: "0.6rem",
            color: "#2a1f10", letterSpacing: "0.15em",
          }}>
            SOMETHING WENT WRONG
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              fontFamily: "var(--font-mono)", fontSize: "0.6rem",
              color: "#C9A84C", background: "transparent",
              border: "1px solid rgba(201,168,76,0.3)",
              borderRadius: 999, padding: "5px 16px",
              cursor: "pointer", letterSpacing: "0.1em",
            }}
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
