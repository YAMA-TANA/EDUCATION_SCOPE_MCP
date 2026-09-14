import assert from "node:assert/strict";
import test from "node:test";
import {
  checkAnswerScope,
  classifyKnowledgeScope,
  getPrerequisites,
  searchCurriculum,
} from "../src/engine.js";

test("classifies Pythagorean theorem as junior-high grade 3", () => {
  const result = classifyKnowledgeScope("三平方の定理");
  assert.equal(result.bestMatch?.topic, "三平方の定理");
  assert.equal(result.bestMatch?.stage, "中学校");
  assert.equal(result.bestMatch?.grade, 3);
});

test("classifies differentiation as high school", () => {
  const result = classifyKnowledgeScope("微分を使って最大値を求める");
  assert.equal(result.bestMatch?.stage, "高等学校");
  assert.equal(result.bestMatch?.topic, "微分法・積分法");
});

test("flags concepts above a target grade", () => {
  const result = checkAnswerScope(
    "三平方の定理を使って斜辺の長さを求めます。",
    "中2",
  );
  assert.equal(result.withinTarget, false);
  assert.ok(result.exceedsTarget.some((item) => item.topic === "三平方の定理"));
});

test("accepts a detected concept inside target grade", () => {
  const result = checkAnswerScope("一次関数の傾きを求めます。", "中2");
  assert.equal(result.withinTarget, true);
  assert.equal(result.exceedsTarget.length, 0);
});

test("returns prerequisite tree", () => {
  const result = getPrerequisites("三平方の定理", 2);
  assert.equal(result.matched?.topic, "三平方の定理");
  const prerequisiteTopics = result.tree?.prerequisites.map((node) => node.item.topic) ?? [];
  assert.ok(prerequisiteTopics.includes("平方根"));
  assert.ok(prerequisiteTopics.includes("相似な図形"));
});

test("searches by stage and subject", () => {
  const items = searchCurriculum({ stage: "中学校", subject: "数学", limit: 100 });
  assert.ok(items.length > 5);
  assert.ok(items.every((item) => item.stage === "中学校"));
  assert.ok(items.every((item) => item.subject === "数学"));
});
