// Diagram DSL grammar (Peggy)
// Output: { nodes: [...], groups: [...], edges: [...] }
// Nodes and groups carry `parent` (null at top level) so the layout step can nest them.

{{
  function flatten(items, parent) {
    const out = { nodes: [], groups: [], edges: [] };
    for (const it of items) {
      if (it.kind === "node") out.nodes.push({ ...it.data, parent });
      else if (it.kind === "group") {
        out.groups.push({ id: it.data.id, attrs: it.data.attrs, parent, loc: it.data.loc });
        const inner = flatten(it.data.children, it.data.id);
        out.nodes.push(...inner.nodes);
        out.groups.push(...inner.groups);
        out.edges.push(...inner.edges);
      } else if (it.kind === "edge") out.edges.push(...it.data);
    }
    return out;
  }
}}

Diagram
  = _ items:(Statement _)* { return flatten(items.map(i => i[0]), null); }

Statement
  = Edge / Group / Node

// ---------- Nodes & groups ----------
Node
  = id:Ident __ attrs:Attrs? {
      return { kind: "node", data: { id, attrs: attrs || {}, loc: location().start } };
    }

Group
  = id:Ident __ attrs:Attrs? _ "{" _ children:(Statement _)* "}" {
      return { kind: "group", data: { id, attrs: attrs || {}, children: children.map(c => c[0]), loc: location().start } };
    }

Attrs
  = "[" _ first:Attr rest:(_ "," _ Attr)* _ ","? _ "]" {
      return Object.fromEntries([first, ...rest.map(r => r[3])]);
    }

Attr
  = key:Ident _ ":" _ value:(String / Bare) { return [key, value]; }

// ---------- Edges ----------
// A > B, A < B, A <> B, A - B, chains like A > B > C, optional label
Edge
  = head:Ident tail:(__ EdgeOp __ Ident)+ label:(__ ":" _ String)? {
      const edges = [];
      let from = head;
      for (const [, op, , to] of tail) {
        const e = op === "<"
          ? { from: to, to: from, arrow: "forward" }
          : { from, to, arrow: op === ">" ? "forward" : op === "<>" ? "both" : "none" };
        edges.push(e);
        from = to;
      }
      if (label) edges[edges.length - 1].label = label[3];
      const loc = location().start;
      return { kind: "edge", data: edges.map(e => ({ ...e, loc })) };
    }

EdgeOp = "<>" / ">" / "<" / "-"

// ---------- Lexical ----------
Ident  "identifier" = $([A-Za-z_][A-Za-z0-9_]*)
String "string"     = '"' chars:$([^"\\] / "\\" .)* '"' { return chars.replace(/\\(.)/g, "$1"); }
Bare   "value"      = $([A-Za-z0-9_\-\.]+)

Comment = "//" [^\n]*
WS      = [ \t\r\n]
_       = (WS / Comment)*          // any whitespace incl. newlines
__      = [ \t]*                   // same-line spacing only
