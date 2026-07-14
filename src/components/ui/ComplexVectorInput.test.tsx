import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComplexVectorInput } from "./ComplexVectorInput";

describe("ComplexVectorInput", () => {
  it("edits one complex component without mutating the source", () => {
    const value = {
      dimension: 2 as const,
      entries: [
        { real: 1, imag: 2 },
        { real: 3, imag: -1 },
      ],
    };
    const onChange = vi.fn();
    render(
      <ComplexVectorInput
        label="u"
        name="first"
        value={value}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("u y 分量虚部"), {
      target: { value: "4" },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      dimension: 2,
      entries: [
        { real: 1, imag: 2 },
        { real: 3, imag: 4 },
      ],
    });
    expect(value.entries[1]).toEqual({ real: 3, imag: -1 });
  });
});
