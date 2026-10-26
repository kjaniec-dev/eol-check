import type { Component } from '../types.ts';
import { GO } from '../mapping.ts';

export function parseGoMod(text: string): Component[] {
  const go = /^go\s+(\d+\.\d+(?:\.\d+)?)/m.exec(text);
  if (!go) return [];
  return [
    { source: 'go.mod', kind: 'runtime', label: `go ${go[1]}`, product: GO, version: go[1]! },
  ];
}
