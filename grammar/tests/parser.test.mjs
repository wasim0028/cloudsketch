import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../parser.mjs";

test("nested groups record parents", () => {
  const g = parse(`AWS [icon: aws-cloud] {\n VPC [icon: aws-vpc] {\n  EKS [icon: aws-eks]\n }\n}`);
  assert.deepEqual(g.groups.map((x) => [x.id, x.parent]), [["AWS", null], ["VPC", "AWS"]]);
  assert.equal(g.nodes[0].parent, "VPC");
});

test("node attrs: bare and quoted values", () => {
  const g = parse(`RDS [icon: aws-rds, label: "Postgres 16"]`);
  assert.deepEqual(g.nodes[0].attrs, { icon: "aws-rds", label: "Postgres 16" });
});

test("node without attrs", () => {
  assert.equal(parse("Worker").nodes[0].id, "Worker");
});

test("edge operators normalize", () => {
  const g = parse("A > B\nA < C\nA <> D\nA - E");
  assert.deepEqual(
    g.edges.map(({ from, to, arrow }) => [from, to, arrow]),
    [["A", "B", "forward"], ["C", "A", "forward"], ["A", "D", "both"], ["A", "E", "none"]]
  );
});

test("chained edges and label on last hop", () => {
  const g = parse(`User > ALB > EKS: "HTTP"`);
  assert.equal(g.edges.length, 2);
  assert.equal(g.edges[1].label, "HTTP");
  assert.equal(g.edges[0].label, undefined);
});

test("comments and blank lines ignored", () => {
  const g = parse("// header\n\nA // trailing\n\nB\n");
  assert.equal(g.nodes.length, 2);
});

test("syntax error has a line number", () => {
  assert.throws(() => parse("A\nB [icon aws]"), (e) => e.location.start.line === 2);
});
