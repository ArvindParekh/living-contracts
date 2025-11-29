"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

interface LogEntry {
  id: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  logs: LogEntry[];
  status: "idle" | "generating" | "error";
  schema: string | null;
  config: any | null;
}

// Singleton state to share across components
let socket: Socket | null = null;
let listeners: ((state: SocketState) => void)[] = [];

let state: SocketState = {
  socket: null,
  isConnected: false,
  logs: [],
  status: "idle",
  schema: null,
  config: null,
};

const notifyListeners = () => {
  listeners.forEach((listener) => listener({ ...state }));
};

export function useSocket() {
  const [localState, setLocalState] = useState<SocketState>(state);

  useEffect(() => {
    listeners.push(setLocalState);

    if (!socket) {
      // Connect to CLI socket server
      socket = io("http://localhost:3001");

      socket.on("connect", () => {
        state.isConnected = true;
        state.socket = socket;
        notifyListeners();
      });

      socket.on("disconnect", () => {
        state.isConnected = false;
        notifyListeners();
      });

      socket.on("log", (log: any) => {
        // Parse timestamp back to Date
        const entry = { ...log, timestamp: new Date(log.timestamp) };
        state.logs = [entry, ...state.logs].slice(0, 1000); // Keep last 1000 logs
        notifyListeners();
      });

      socket.on("status", (status: any) => {
        state.status = status;
        notifyListeners();
      });

      socket.on("schema", (schema: string) => {
        state.schema = schema;
        notifyListeners();
      });

      socket.on("config", (config: any) => {
        state.config = config;
        notifyListeners();
      });
    }

    return () => {
      listeners = listeners.filter((l) => l !== setLocalState);
    };
  }, []);

  return localState;
}
