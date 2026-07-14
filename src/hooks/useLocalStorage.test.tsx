import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalStorage } from "./useLocalStorage";

interface StoredState {
  count: number;
  label: string;
}

const STORAGE_KEY = "basis-lab:test-state";
const INITIAL_STATE: StoredState = { count: 1, label: "initial" };

interface HarnessProps {
  storageKey?: string;
  initialValue?: StoredState;
  migrate?: (stored: unknown) => StoredState;
}

function Harness({
  storageKey = STORAGE_KEY,
  initialValue = INITIAL_STATE,
  migrate,
}: HarnessProps) {
  const [value, setValue, reset] = useLocalStorage(
    storageKey,
    initialValue,
    migrate,
  );

  return (
    <>
      <output data-testid="value">{JSON.stringify(value)}</output>
      <button
        type="button"
        onClick={() =>
          setValue((current) => ({ ...current, count: current.count + 1 }))
        }
      >
        increment
      </button>
      <button type="button" onClick={reset}>
        reset
      </button>
    </>
  );
}

function expectRenderedValue(value: StoredState) {
  expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(value));
}

describe("useLocalStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps the existing parsed-storage behavior when no migration is supplied", async () => {
    const stored = { count: 4, label: "current" };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    render(<Harness />);

    expectRenderedValue(stored);
    fireEvent.click(screen.getByRole("button", { name: "increment" }));
    const updated = { count: 5, label: "current" };
    expectRenderedValue(updated);
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
        JSON.stringify(updated),
      ),
    );
  });

  it("migrates parsed unknown data once and persists the migrated value", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, total: "7" }),
    );
    const migrate = vi.fn((stored: unknown): StoredState => {
      const legacy = stored as { total: string };
      return { count: Number(legacy.total), label: "migrated" };
    });

    const { rerender } = render(<Harness migrate={migrate} />);

    const migrated = { count: 7, label: "migrated" };
    expectRenderedValue(migrated);
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
        JSON.stringify(migrated),
      ),
    );

    rerender(<Harness migrate={migrate} />);
    fireEvent.click(screen.getByRole("button", { name: "increment" }));
    expectRenderedValue({ count: 8, label: "migrated" });
    expect(migrate).toHaveBeenCalledTimes(1);
  });

  it("falls back to the initial value when stored JSON is damaged", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{not-json");
    const migrate = vi.fn((stored: unknown) => stored as StoredState);

    render(<Harness migrate={migrate} />);

    expectRenderedValue(INITIAL_STATE);
    expect(migrate).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
        JSON.stringify(INITIAL_STATE),
      ),
    );
  });

  it("falls back to the initial value when migration rejects stored data", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: -1 }));
    const migrate = vi.fn((): StoredState => {
      throw new Error("unsupported state");
    });

    render(<Harness migrate={migrate} />);

    expectRenderedValue(INITIAL_STATE);
    expect(migrate).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
        JSON.stringify(INITIAL_STATE),
      ),
    );
  });

  it("does not migrate a missing key and resets to the stable initial value", () => {
    const migrate = vi.fn((stored: unknown) => stored as StoredState);
    render(<Harness migrate={migrate} />);

    expectRenderedValue(INITIAL_STATE);
    expect(migrate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "increment" }));
    expectRenderedValue({ count: 2, label: "initial" });
    fireEvent.click(screen.getByRole("button", { name: "reset" }));
    expectRenderedValue(INITIAL_STATE);
  });
});
