const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parse, layout, serialize } = require("../converter");
const rc =
  "Filter\nV1 in 0 AC 1\nR1 in out 1k\nC1 out 0 100n\n.AC DEC 10 10 100k\n.END";
test("RC sheet has consistent page length, analysis and terminal connectivity", () => {
  const d = layout(parse(rc)),
    sch = serialize(d);
  assert.equal(d.nets.length, 3);
  assert.equal(d.nets.flatMap((n) => n.joins).length, 7);
  assert.equal(
    Number(/pageloc 1 0 (\d+)/.exec(sch)[1]),
    Buffer.byteLength(sch.slice(sch.indexOf("*page"))),
  );
  assert.match(sch, /ACMAG=1/);
  assert.match(sch, /\.AC 1 3 0\n\+0 10/);
  for (const n of d.nets)
    for (const [x, y] of n.joins)
      assert.ok(
        n.segments.some(
          ([a, b, c, e]) => (a === x && b === y) || (c === x && e === y),
        ),
      );
});
test("controlled source uses output pins 3/4 and control pins 1/2", () => {
  const d = layout(
    parse("amp\nEamp out 0 p m 1e5\nVin p 0 AC 1 SIN(0 0.1 1k)\nR1 m 0 680"),
  );
  assert.deepEqual(d.parts[1].attrs, {
    AC: "1",
    VOFF: "0",
    VAMPL: "0.1",
    FREQ: "1k",
  });
  for (const [i, node] of ["p", "m", "out", "0"].entries())
    assert.ok(
      d.nets
        .find((n) => n.node === node)
        .joins.some((j) => j[2] === `p ${d.parts[0].id} ${i + 1}`),
    );
});
test("unknown syntax and duplicate references block export", () => {
  for (const row of [
    "X1 out 0 IC",
    ".tran 1u 5m",
    "R1 a 0 1k EXTRA",
    "r2 a 0 4k",
    "V2 a 0 PULSE(0 1)",
  ])
    assert.throws(() => parse("Title\nR2 a 0 3k\n" + row));
});
