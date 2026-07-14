import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ComplexMatrixInput,
  type ComplexMatrixValue,
} from "./ComplexMatrixInput";
import {
  DynamicMatrixInput,
  type DynamicMatrixValue,
} from "./DynamicMatrixInput";
import {
  DynamicVectorInput,
  type DynamicVectorValue,
} from "./DynamicVectorInput";

describe("DynamicMatrixInput", () => {
  it("renders a configurable 3 by 2 matrix and updates immutably", () => {
    const value: DynamicMatrixValue = {
      rows: 3,
      columns: 2,
      entries: [1, 2, 3, 4, 5, 6],
    };
    const onChange = vi.fn();
    const { container } = render(
      <DynamicMatrixInput
        label="测试矩阵"
        value={value}
        onChange={onChange}
        testId="custom-cell"
      />,
    );

    expect(screen.getAllByTestId("custom-cell")).toHaveLength(6);
    expect(screen.getByLabelText("测试矩阵 第三行第二列")).toHaveValue("6");
    expect(
      container
        .querySelector<HTMLElement>(".matrix-editor")
        ?.style.getPropertyValue("--matrix-columns"),
    ).toBe("2");

    fireEvent.change(screen.getByLabelText("测试矩阵 第二行第一列"), {
      target: { value: "8" },
    });

    const next = onChange.mock.lastCall?.[0] as DynamicMatrixValue;
    expect(next).not.toBe(value);
    expect(next.entries).not.toBe(value.entries);
    expect(next.entries).toEqual([1, 2, 8, 4, 5, 6]);
    expect(value.entries).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("forwards disabled to every matrix cell", () => {
    render(
      <DynamicMatrixInput
        label="禁用矩阵"
        value={{ rows: 1, columns: 3, entries: [1, 2, 3] }}
        onChange={() => undefined}
        disabled
      />,
    );

    for (const input of screen.getAllByTestId("matrix-cell")) {
      expect(input).toBeDisabled();
    }
  });
});

describe("DynamicVectorInput", () => {
  it("renders one to three named components and updates immutably", () => {
    const value: DynamicVectorValue = {
      dimension: 3,
      entries: [1, 2, 3],
    };
    const onChange = vi.fn();
    render(
      <DynamicVectorInput
        label="v"
        name="sample"
        value={value}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("v x 分量")).toHaveValue("1");
    expect(screen.getByLabelText("v y 分量")).toHaveValue("2");
    expect(screen.getByLabelText("v z 分量")).toHaveValue("3");

    fireEvent.change(screen.getByLabelText("v z 分量"), {
      target: { value: "-4" },
    });

    const next = onChange.mock.lastCall?.[0] as DynamicVectorValue;
    expect(next).not.toBe(value);
    expect(next.entries).not.toBe(value.entries);
    expect(next.entries).toEqual([1, 2, -4]);
    expect(value.entries).toEqual([1, 2, 3]);
  });

  it("forwards disabled to every vector component", () => {
    render(
      <DynamicVectorInput
        label="u"
        name="disabled"
        value={{ dimension: 2, entries: [1, 0] }}
        onChange={() => undefined}
        disabled
      />,
    );

    expect(screen.getByLabelText("u x 分量")).toBeDisabled();
    expect(screen.getByLabelText("u y 分量")).toBeDisabled();
  });
});

describe("ComplexMatrixInput", () => {
  it("renders real and imaginary fields and updates one part immutably", () => {
    const value: ComplexMatrixValue = {
      rows: 2,
      columns: 2,
      entries: [
        { real: 1, imag: 0 },
        { real: 2, imag: 3 },
        { real: 2, imag: -3 },
        { real: 4, imag: 0 },
      ],
    };
    const onChange = vi.fn();
    const { container } = render(
      <ComplexMatrixInput label="度量矩阵" value={value} onChange={onChange} />,
    );

    expect(screen.getAllByTestId("matrix-cell")).toHaveLength(8);
    expect(screen.getByLabelText("度量矩阵 第二行第一列 虚部")).toHaveValue(
      "-3",
    );
    expect(
      container
        .querySelector<HTMLElement>(".matrix-editor")
        ?.style.getPropertyValue("--matrix-columns"),
    ).toBe("2");

    fireEvent.change(screen.getByLabelText("度量矩阵 第一行第二列 实部"), {
      target: { value: "5" },
    });

    const next = onChange.mock.lastCall?.[0] as ComplexMatrixValue;
    expect(next).not.toBe(value);
    expect(next.entries).not.toBe(value.entries);
    expect(next.entries[0]).toBe(value.entries[0]);
    expect(next.entries[1]).not.toBe(value.entries[1]);
    expect(next.entries[1]).toEqual({ real: 5, imag: 3 });
    expect(value.entries[1]).toEqual({ real: 2, imag: 3 });
  });

  it("forwards disabled to every real and imaginary field", () => {
    render(
      <ComplexMatrixInput
        label="禁用复矩阵"
        value={{
          rows: 1,
          columns: 1,
          entries: [{ real: 1, imag: 2 }],
        }}
        onChange={() => undefined}
        disabled
      />,
    );

    expect(
      screen.getByLabelText("禁用复矩阵 第一行第一列 实部"),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("禁用复矩阵 第一行第一列 虚部"),
    ).toBeDisabled();
  });
});
