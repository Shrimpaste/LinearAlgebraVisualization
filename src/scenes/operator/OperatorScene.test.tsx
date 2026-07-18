import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorScene } from "./OperatorScene";

vi.mock("../../components/VisualizationStage", async () => {
  const { createElement, forwardRef, useImperativeHandle } =
    await import("react");
  return {
    VisualizationStage: forwardRef(function MockVisualizationStage(
      props: {
        readonly ariaLabel: string;
        readonly fallbackDescription: string;
      },
      ref,
    ) {
      useImperativeHandle(ref, () => ({
        pause: vi.fn(),
        replay: vi.fn(),
        seek: vi.fn(),
        getTimeline: () => ({ progress: 1 }),
      }));
      return createElement(
        "div",
        {
          role: "img",
          "aria-label": props.ariaLabel,
          "data-testid": "visualization-stage",
        },
        props.fallbackDescription,
      );
    }),
  };
});

vi.mock("./ThreeOperatorStage", async () => {
  const { createElement, forwardRef, useImperativeHandle } =
    await import("react");
  return {
    ThreeOperatorStage: forwardRef(
      function MockThreeOperatorStage(_props, ref) {
        useImperativeHandle(ref, () => ({
          pause: vi.fn(),
          replay: vi.fn(),
          seek: vi.fn(),
          getProgress: () => 1,
        }));
        return createElement("div", {
          role: "img",
          "aria-label": "R3 实 normal 算子的谱结构与向量作用三维舞台",
          "data-testid": "visualization-stage",
        });
      },
    ),
  };
});

describe("OperatorScene teaching workflow", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts with a real vector application pipeline and switches to spectral structure", () => {
    render(<OperatorScene theme="light" />);

    expect(screen.getByTestId("formula-readout")).toHaveTextContent(
      "x → U*x → Λc → UΛc = Ax",
    );
    expect(
      screen.getByRole("img", { name: /真实计算流水线/ }),
    ).toHaveTextContent("测试向量 x=");
    expect(screen.getAllByTestId("operator-vector-component")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "谱分解教学步骤" })).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "查看谱结构" }));
    expect(screen.getByTestId("formula-readout")).toHaveTextContent(
      "A = Σ λPλ = U Λ U*",
    );
    expect(
      screen.queryByTestId("operator-vector-component"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /谱点、特征子空间和谱投影/ }),
    ).toBeVisible();
  });

  it("uses read-only math factors instead of disabled matrix inputs", () => {
    render(<OperatorScene theme="dark" />);
    fireEvent.click(screen.getByRole("radio", { name: "U / Λ" }));

    expect(screen.getByLabelText("酉特征基矩阵")).toBeVisible();
    expect(screen.getByLabelText("特征值对角矩阵")).toBeVisible();
    expect(screen.getAllByTestId("operator-u-cell")).toHaveLength(4);
    expect(
      screen.queryByRole("spinbutton", { name: /酉特征基矩阵/ }),
    ).not.toBeInTheDocument();
  });

  it("turns a non-normal preset into an explicit commutator diagnostic", () => {
    render(<OperatorScene theme="light" />);
    fireEvent.click(screen.getByRole("button", { name: "非 normal 剪切" }));

    expect(screen.getByTestId("formula-readout")).toHaveTextContent(
      "A*A ≠ AA*",
    );
    expect(screen.getByText(/只排除酉对角化/)).toBeVisible();
    expect(
      screen.getByRole("img", { name: "非 normal 算子的交换子诊断" }),
    ).toHaveTextContent(/交换子 A\*A-AA\* 非零/);
    expect(
      screen.queryByRole("group", { name: "谱分解教学步骤" }),
    ).not.toBeInTheDocument();
  });

  it("routes a real three-dimensional normal operator through Three.js", async () => {
    render(<OperatorScene theme="dark" />);
    fireEvent.change(screen.getByRole("combobox", { name: "空间维数" }), {
      target: { value: "3" },
    });

    expect(
      await screen.findByRole("img", {
        name: "R3 实 normal 算子的谱结构与向量作用三维舞台",
      }),
    ).toBeVisible();
  });

  it("groups a repeated eigenvalue by its canonical spectral projector", () => {
    render(<OperatorScene theme="light" />);
    fireEvent.change(screen.getByRole("combobox", { name: "空间维数" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "重复特征子空间" }));

    expect(screen.getByText(/重根下 U 可变，谱投影 Pλ 不变/)).toBeVisible();
    expect(screen.getByText("dim 2 · Pλ 唯一")).toBeVisible();
  });
});
