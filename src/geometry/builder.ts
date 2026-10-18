/**
 * A small helper to build constructions in code (templates, figures typed as text):
 * named points, then tools applied by point names, with the names the textbook uses.
 */
import { computeAll, type Values } from './engine';
import { emptyConstruction, type Construction, type Def, type GeoObject, type Id, type Style } from './model';
import { createFromTool, nextId, type ToolId } from './tools';

export class Fig {
  c: Construction;

  constructor(base?: Partial<Construction>) {
    this.c = { ...emptyConstruction(), ...base, objects: [...(base?.objects ?? [])] };
  }

  get values(): Values {
    return computeAll(this.c);
  }

  /** The id of the object labelled `label` (points first). */
  id(label: string): Id {
    const o = this.c.objects.find((x) => x.style.label === label && this.values.get(x.id)?.k === 'point') ?? this.c.objects.find((x) => x.style.label === label);
    if (!o) throw new Error(`Không có điểm ${label}`);
    return o.id;
  }

  has(label: string): boolean {
    return this.c.objects.some((x) => x.style.label === label);
  }

  /** A free point named `label` at (x; y). */
  pt(label: string, x: number, y: number, style: Style = {}): Id {
    const id = nextId(this.c, 'p');
    this.c.objects.push({ id, def: { t: 'point', x, y }, style: { label, ...style } });
    return id;
  }

  /** Adds an object directly. */
  add(prefix: string, def: Def, style: Style = {}): Id {
    const id = nextId(this.c, prefix);
    this.c.objects.push({ id, def, style });
    return id;
  }

  /** Applies a tool; picks are labels or ids. Returns the objects it made. */
  tool(tool: ToolId, picks: string[], answer?: string, opts: { fresh?: string[]; compass?: boolean; halves?: boolean } = {}): GeoObject[] {
    const ids = picks.map((p) => (this.c.objects.some((o) => o.id === p) ? p : this.id(p)));
    const fresh = opts.fresh?.map((p) => (this.c.objects.some((o) => o.id === p) ? p : this.id(p)));
    const r = createFromTool(this.c, tool, ids, answer, { values: this.values, fresh, compass: opts.compass, halves: opts.halves });
    let objects = [...this.c.objects, ...r.objects];
    if (r.restyle) objects = objects.map((o) => ({ ...o, style: { ...o.style, ...(r.restyle!.find((x) => x.id === o.id)?.style ?? {}) } }));
    this.c = { ...this.c, objects };
    return r.objects;
  }

  /** Renames the first point made by `objs` (or the object with that id). */
  name(objs: GeoObject[] | Id, label: string, kind = 'point'): void {
    const target = typeof objs === 'string' ? objs : objs.find((o) => this.values.get(o.id)?.k === kind)?.id;
    if (!target) return;
    this.c.objects = this.c.objects.map((o) => (o.id === target ? { ...o, style: { ...o.style, label } } : o));
  }

  /** Names the points made by `objs`, in order. */
  names(objs: GeoObject[], labels: string[]): void {
    const pts = objs.filter((o) => this.values.get(o.id)?.k === 'point' && !o.style.hidden);
    pts.forEach((o, i) => labels[i] && this.name(o.id, labels[i]));
  }

  style(id: Id, s: Style): void {
    this.c.objects = this.c.objects.map((o) => (o.id === id ? { ...o, style: { ...o.style, ...s } } : o));
  }

  seg(a: string, b: string, style: Style = {}): Id {
    return this.add('s', { t: 'segment', a: this.id(a), b: this.id(b) }, style);
  }

  poly(labels: string[], style: Style = {}): Id {
    return this.add('poly', { t: 'polygon', pts: labels.map((l) => this.id(l)) }, style);
  }

  angle(a: string, v: string, b: string, style: Style = {}): Id {
    return this.add('ang', { t: 'angle', a: this.id(a), b: this.id(v), c: this.id(b) }, style);
  }
}
