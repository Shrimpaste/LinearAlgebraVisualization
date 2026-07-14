import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { NumberField } from "./NumberField";

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState(1);
  return (
    <>
      <NumberField
        label="测试数值"
        value={value}
        onChange={setValue}
        step={0.5}
        disabled={disabled}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("NumberField", () => {
  it("preserves a transient minus sign and commits a negative value", () => {
    render(<Harness />);
    const input = screen.getByLabelText("测试数值");

    fireEvent.change(input, { target: { value: "-" } });
    expect(input).toHaveValue("-");
    expect(screen.getByTestId("value")).toHaveTextContent("1");

    fireEvent.change(input, { target: { value: "-2" } });
    expect(input).toHaveValue("-2");
    expect(screen.getByTestId("value")).toHaveTextContent("-2");
  });

  it("restores an incomplete draft on blur and supports keyboard stepping", () => {
    render(<Harness />);
    const input = screen.getByLabelText("测试数值");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("1");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveValue("1.5");
    expect(screen.getByTestId("value")).toHaveTextContent("1.5");
  });

  it("forwards the disabled state to the input", () => {
    render(<Harness disabled />);
    expect(screen.getByLabelText("测试数值")).toBeDisabled();
  });

  it("shows the exact round-trippable external value", () => {
    function PreciseHarness() {
      const [value, setValue] = useState(2_000_000.0001);
      return <NumberField label="精确数值" value={value} onChange={setValue} />;
    }

    render(<PreciseHarness />);
    expect(screen.getByLabelText("精确数值")).toHaveValue("2000000.0001");
  });
});
