import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeGrades,
  normalizeMextSource,
  stripSectionMarker,
} from "../src/mext.js";

test("decodes MEXT elementary multi-grade codes", () => {
  assert.deepEqual(decodeGrades("小学校", "82101A0000000000"), [1, 2]);
  assert.deepEqual(decodeGrades("小学校", "82101C0000000000"), [3, 4]);
  assert.deepEqual(decodeGrades("小学校", "82101D0000000000"), [5, 6]);
  assert.deepEqual(decodeGrades("小学校", "82101L0000000000"), [3, 4, 5, 6]);
});

test("decodes MEXT junior-high multi-grade codes", () => {
  assert.deepEqual(decodeGrades("中学校", "83101A0000000000"), [1, 2]);
  assert.deepEqual(decodeGrades("中学校", "83101B0000000000"), [2, 3]);
});

test("does not invent a high-school grade", () => {
  assert.deepEqual(decodeGrades("高等学校", "8410200000000000"), []);
});

test("strips common curriculum section markers", () => {
  assert.equal(stripSectionMarker("Ａ　数と式"), "数と式");
  assert.equal(stripSectionMarker("（1） 三平方の定理"), "三平方の定理");
  assert.equal(stripSectionMarker("第3章　関数"), "関数");
});

test("normalizes a MEXT row with grade, code, and hierarchy", () => {
  const items = normalizeMextSource({
    stage: "中学校",
    codeTable: "83V11",
    sourceUrl: "https://example.test/mext.csv",
    rows: [
      {
        No: "100",
        教科等: "数学",
        学習指導要領コード: "8350233A00000000",
        学習指導要領テキスト: "Ａ　数と式",
      },
      {
        No: "101",
        教科等: "数学",
        学習指導要領コード: "8350233A10000000",
        学習指導要領テキスト: "（1） 三平方の定理",
      },
    ],
  });

  const child = items.find(
    (item) => item.curriculumCode === "8350233A10000000",
  );
  assert.ok(child);
  assert.equal(child.stage, "中学校");
  assert.equal(child.grade, 3);
  assert.deepEqual(child.grades, [3]);
  assert.equal(child.subject, "数学");
  assert.equal(child.domain, "数と式");
  assert.equal(child.topic, "三平方の定理");
  assert.deepEqual(child.sectionPath, ["数と式", "三平方の定理"]);
  assert.equal(child.dataOrigin, "mext");
  assert.equal(child.codeTable, "83V11");
});
