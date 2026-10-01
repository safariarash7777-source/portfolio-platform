"use client";
import { useState } from "react";
import { retainValidBoard } from "@/lib/market-refresh";

/** Adjust retained props during render, so failure never flashes an empty table. */
export function useRetainedBoard<T>(incoming: T, valid: boolean, same: (a: T, b: T) => boolean): T {
  const [previous, setPrevious] = useState(incoming);
  const value = retainValidBoard(previous, incoming, valid);
  if (valid && !same(previous, incoming)) setPrevious(incoming);
  return value;
}
