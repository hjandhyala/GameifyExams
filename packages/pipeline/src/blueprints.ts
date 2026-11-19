import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackId } from '@prepdle/core';
import { parse } from 'yaml';
import { ROOT } from './ops/assets';
import type { BlueprintWeights } from './publish/schedule';

export interface Leaf {
  code: string;
  name: string;
  /** Absolute share of the track (top weight × leaf weight). */
  weight: number;
  top: string;
  path: string;
}

interface Node {
  name: string;
  weight?: number;
  children?: Record<string, Node>;
}

export function loadBlueprint(track: TrackId): { leaves: Leaf[]; weights: BlueprintWeights } {
  const doc = parse(readFileSync(join(ROOT, `packages/content/blueprints/${track}.yaml`), 'utf8')) as { nodes: Record<string, Node> };
  const leaves: Leaf[] = [];
  const top: Record<string, number> = {};
  for (const [code, node] of Object.entries(doc.nodes)) {
    const w = node.weight ?? 0;
    top[code] = w;
    const kids = Object.entries(node.children ?? {});
    if (!kids.length) leaves.push({ code, name: node.name, weight: w, top: code, path: node.name });
    const total = kids.reduce((a, [, k]) => a + (k.weight ?? 0), 0) || 1;
    for (const [kc, k] of kids) leaves.push({ code: kc, name: `${node.name} › ${k.name}`, weight: (w * (k.weight ?? 0)) / total, top: code, path: `${node.name} › ${k.name}` });
  }
  return { leaves, weights: { top } };
}

export function allBlueprintWeights(): Partial<Record<TrackId, BlueprintWeights>> {
  return Object.fromEntries((['mcat', 'lsat', 'boards', 'bar'] as const).map((t) => [t, loadBlueprint(t).weights]));
}
