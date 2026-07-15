import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderedRealBasisInput } from "./OrderedRealBasisInput";

const basis = [
  [1, 2],
  [3, 4],
] as const;

describe("OrderedRealBasisInput", () => {
  it("renders and updates ordered vector columns", () => {
    const onChange = vi.fn();
    render(
      <OrderedRealBasisInput
        label="定义域有序基"
        symbol="v"
        basis={basis}
        dimension={2}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("v1 x 分量")).toHaveValue("1");
    expect(screen.getByLabelText("v2 x 分量")).toHaveValue("2");
    fireEvent.change(screen.getByLabelText("v2 x 分量"), {
      target: { value: "7" },
    });

    expect(onChange).toHaveBeenCalledWith([
      [1, 7],
      [3, 4],
    ]);
    expect(basis).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("supports codomain labels and disabled state", () => {
    const onChange = vi.fn();
    render(
      <OrderedRealBasisInput
        label="陪域有序基"
        symbol="w"
        basis={basis}
        dimension={2}
        onChange={onChange}
        disabled
      />,
    );

    expect(screen.getByLabelText("w1 x 分量")).toBeDisabled();
  });

  it("normalizes missing entries at the controlled boundary", () => {
    render(
      <OrderedRealBasisInput
        label="坐标基"
        symbol="q"
        basis={[[1], []]}
        dimension={2}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText("q2 x 分量")).toHaveValue("0");
    expect(screen.getByLabelText("q2 y 分量")).toHaveValue("0");
  });
});
