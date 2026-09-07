import { expect, test } from "@playwright/test";

test("eigen playback changes geometry and retains a real rotation counterexample", async ({
  page,
}) => {
  await page.goto("/#eigen");
  const slider = page.getByRole("slider", { name: "动画进度" });
  await slider.fill("0");
  const before = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await slider.fill("1");
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    )
    .not.toBe(before);
  await page.getByRole("button", { name: "纯旋转", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "候选 v x 分量", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("formula-readout")).toContainText("1i");
});

test("determinant distinguishes current and target and animates column operations", async ({
  page,
}) => {
  await page.goto("/#determinant");
  const names = [
    "第一行第一列",
    "第一行第二列",
    "第二行第一列",
    "第二行第二列",
  ];
  for (let i = 0; i < 4; i++)
    await page
      .getByRole("spinbutton", { name: `行列式矩阵 ${names[i]}`, exact: true })
      .fill(i === 0 || i === 3 ? "-1" : "0");
  await page.getByRole("slider", { name: "动画进度" }).fill("0.5");
  await expect(page.getByTestId("determinant-current")).toContainText(
    "当前 det M(t) = 0",
  );
  await expect(page.getByTestId("determinant-current")).toContainText(
    "目标 det A = 1",
  );
  await page.getByRole("slider", { name: "动画进度" }).fill("1");
  await page.getByRole("button", { name: "a₂ += a₁", exact: true }).click();
  await page.getByRole("slider", { name: "动画进度" }).fill("0.5");
  await expect(page.getByTestId("determinant-current")).toContainText(
    "当前 det M(t) = 1",
  );
});

test("experiment link restores matrix and timeline in a fresh browser context", async ({
  page,
  context,
  browser,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#transform");
  const input = page.getByRole("spinbutton", {
    name: "变换矩阵 第一行第一列",
    exact: true,
  });
  await input.fill("7");
  await page.getByRole("slider", { name: "动画进度" }).fill("0.5");
  await page.getByRole("button", { name: "分享当前实验", exact: true }).click();
  await expect(page.locator(".experiment-message")).toContainText(
    "实验链接已复制",
  );
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const fresh = await browser.newContext();
  try {
    const target = await fresh.newPage();
    await target.goto(link);
    await expect(
      target.getByRole("spinbutton", {
        name: "变换矩阵 第一行第一列",
        exact: true,
      }),
    ).toHaveValue("7");
    await expect(target.getByRole("slider", { name: "动画进度" })).toHaveValue(
      "0.5",
    );
  } finally {
    await fresh.close();
  }
});

test("undo redo and malformed import preserve the experiment", async ({
  page,
}) => {
  await page.goto("/#transform");
  const cell = page.getByRole("spinbutton", {
    name: "变换矩阵 第一行第一列",
    exact: true,
  });
  await cell.fill("7");
  await page.getByRole("button", { name: "撤销实验修改" }).click();
  await expect(cell).toHaveValue("1.35");
  await page.getByRole("button", { name: "重做实验修改" }).click();
  await expect(cell).toHaveValue("7");
  await page.getByText("实验快照、导出与跨模块", { exact: true }).click();
  await page.getByLabel("导入实验文件").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"basis-lab-experiment","version":99}'),
  });
  await expect(page.locator(".experiment-message")).toContainText("不支持");
  await expect(cell).toHaveValue("7");
});

test("mobile matrix editing keeps the canvas visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#transform");
  const canvas = page.locator("canvas");
  const initial = await canvas.boundingBox();
  await page
    .getByRole("spinbutton", { name: "变换矩阵 第二行第二列", exact: true })
    .fill("2");
  const after = await canvas.boundingBox();
  expect(after!.y).toBeCloseTo(initial!.y, 0);
  expect(after!.y + after!.height).toBeLessThan(550);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
