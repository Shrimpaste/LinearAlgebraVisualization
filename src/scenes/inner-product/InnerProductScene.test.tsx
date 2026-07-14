import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { identityComplexMatrix } from "../../math/nd";
import { innerProductDefaults } from "./model";
import { InnerProductScene } from "./InnerProductScene";

vi.mock("../../hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

vi.mock("../../components/VisualizationStage", async () => {
  const { createElement, forwardRef } = await import("react");
  return {
    VisualizationStage: forwardRef(function MockVisualizationStage(
      props: {
        readonly ariaLabel: string;
        readonly fallbackDescription: string;
        readonly testId?: string;
      },
      _ref,
    ) {
      return createElement(
        "div",
        {
          role: "img",
          "aria-label": props.ariaLabel,
          "data-testid": props.testId ?? "visualization-stage",
        },
        props.fallbackDescription,
      );
    }),
  };
});

const storageKey = "basis-lab:inner-product";

function storeComplexMode(mode: "projection" | "gram-schmidt" | "axioms") {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({ ...innerProductDefaults, field: "C", mode }),
  );
}

describe("InnerProductScene stage contract", () => {
  beforeEach(() => window.localStorage.clear());

  it("exposes a distinct complex draw layer and accessible name per mode", () => {
    storeComplexMode("projection");
    render(<InnerProductScene theme="light" />);

    const contract = screen.getByTestId("inner-product-stage-contract");
    const stage = screen.getByTestId("visualization-stage");
    expect(contract).toHaveAttribute(
      "data-observation",
      "complex-component-argand",
    );
    expect(contract).toHaveAttribute("data-mode", "projection");
    expect(contract).toHaveAttribute(
      "data-draw-layer",
      "orthogonal-projection",
    );
    expect(stage).toHaveAccessibleName(/正交投影.*逐分量 Argand 相位投影/);

    fireEvent.click(screen.getByRole("radio", { name: "Gram–Schmidt" }));
    expect(contract).toHaveAttribute("data-mode", "gram-schmidt");
    expect(contract).toHaveAttribute("data-draw-layer", "orthonormal-basis");
    expect(stage).toHaveAccessibleName(/Gram–Schmidt 正交化/);

    fireEvent.click(screen.getByRole("radio", { name: "公理验证" }));
    expect(contract).toHaveAttribute("data-mode", "axioms");
    expect(contract).toHaveAttribute("data-draw-layer", "axiom-certificate");
    expect(stage).toHaveAccessibleName(/内积公理验证/);
  });

  it("describes R3 as a two-dimensional observation instead of an isometry", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...innerProductDefaults,
        dimension: 3,
        first: [...innerProductDefaults.first, { re: 0.5, im: 0 }],
        second: [...innerProductDefaults.second, { re: -0.25, im: 0 }],
        metric: identityComplexMatrix(3),
      }),
    );
    render(<InnerProductScene theme="light" />);

    expect(screen.getByTestId("inner-product-stage-contract")).toHaveAttribute(
      "data-observation",
      "real-component-2d",
    );
    const stage = screen.getByTestId("visualization-stage");
    expect(stage).toHaveAccessibleName(/R3 分量二维观测投影/);
    expect(stage).not.toHaveAccessibleName(/等距/);
  });
});
