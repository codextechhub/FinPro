/**
 * Selected ledger entity for the Finance & Procurement consoles.
 *
 * Almost every finance/procurement API call is entity-scoped (?entity=<CODE>),
 * so the chosen entity is global console state. We persist only the CODE (a
 * short stable string that appears verbatim in document numbers); the full
 * entity record is fetched fresh from GET /finance/entities/. This slice is
 * added to redux-persist's whitelist so the choice survives a refresh.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootStateType } from "@/redux/store";

interface EntityState {
  /** The active entity's `code` (e.g. "CREST"), or null until one is picked. */
  selectedCode: string | null;
}

const initialState: EntityState = {
  selectedCode: null,
};

const entitySlice = createSlice({
  name: "financeEntity",
  initialState,
  reducers: {
    setSelectedEntity: (state, action: PayloadAction<string | null>) => {
      state.selectedCode = action.payload;
    },
    clearSelectedEntity: (state) => {
      state.selectedCode = null;
    },
  },
});

export const { setSelectedEntity, clearSelectedEntity } = entitySlice.actions;
export const entitySliceReducer = entitySlice.reducer;

export const selectEntityCode = (state: RootStateType): string | null =>
  state.financeEntity?.selectedCode ?? null;
