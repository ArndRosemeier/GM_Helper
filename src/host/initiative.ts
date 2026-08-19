import { portraitCoveredByVeils } from "./veil";
import { combatStatsFrom } from "./runCard";
import { isFighterEntity, isFighterToken } from "./encounter";
import type { TokenId } from "./ids";
import type {
  BattlegroundToken,
  BattlegroundVeil,
  EncounterBoard,
  Entity,
} from "./types";

export function initiativeTotal(token: BattlegroundToken): number | null {
  if (token.initiativeRoll === null || token.initiativeBonus === null) {
    return null;
  }
  return token.initiativeRoll + token.initiativeBonus;
}

export function initiativeBonusForEntity(entity: Entity): number {
  if (!isFighterEntity(entity)) {
    throw new Error(`Card “${entity.runCard.title}” has no initiative`);
  }
  const stats = combatStatsFrom(entity.runCard);
  if (stats === null) {
    throw new Error(`Card “${entity.runCard.title}” has no combat stats`);
  }
  return stats.initiativeBonus;
}

export function rollInitiativeD20(): number {
  return 1 + Math.floor(Math.random() * 20);
}

export function compareInitiativeTokens(
  left: BattlegroundToken,
  right: BattlegroundToken,
): number {
  const leftTotal = initiativeTotal(left);
  const rightTotal = initiativeTotal(right);
  if (leftTotal === null || rightTotal === null) {
    throw new Error("Cannot sort tokens without initiative rolls");
  }
  if (rightTotal !== leftTotal) {
    return rightTotal - leftTotal;
  }
  const leftBonus = left.initiativeBonus ?? 0;
  const rightBonus = right.initiativeBonus ?? 0;
  if (rightBonus !== leftBonus) {
    return rightBonus - leftBonus;
  }
  return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
}

export function sortInitiativeOrder(
  order: ReadonlyArray<TokenId>,
  tokens: ReadonlyArray<BattlegroundToken>,
): TokenId[] {
  const byId = new Map(tokens.map((token) => [token.id, token]));
  return [...order].sort((leftId, rightId) => {
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (left === undefined || right === undefined) {
      throw new Error("Initiative order references a missing token");
    }
    return compareInitiativeTokens(left, right);
  });
}

export function activeInitiativeTokenId(board: EncounterBoard): TokenId | null {
  if (!board.initiativeEnabled || board.initiativeOrder.length === 0) {
    return null;
  }
  return board.initiativeOrder[board.activeIndex] ?? null;
}

export function visibleFighterTokenIds(
  board: EncounterBoard,
  entities: ReadonlyArray<Entity>,
  coveredTokenIds: ReadonlySet<TokenId>,
): TokenId[] {
  const ids: TokenId[] = [];
  for (const token of board.tokens) {
    if (!token.visible || coveredTokenIds.has(token.id)) {
      continue;
    }
    const entity = token.entityId === null ? undefined : entities.find((item) => item.id === token.entityId);
    if (entity === undefined || !isFighterEntity(entity)) {
      continue;
    }
    ids.push(token.id);
  }
  return ids;
}

/** Drop hidden or veiled fighters from initiative order and clear their rolls. */
export function pruneInitiativeToVisibleFighters<T extends EncounterBoard>(
  board: T,
  entities: ReadonlyArray<Entity>,
  coveredTokenIds: ReadonlySet<TokenId>,
): T {
  const visibleIds = new Set(visibleFighterTokenIds(board, entities, coveredTokenIds));
  let tokensChanged = false;
  const tokens = board.tokens.map((token) => {
    if (visibleIds.has(token.id)) {
      return token;
    }
    if (token.initiativeRoll === null && token.initiativeBonus === null) {
      return token;
    }
    tokensChanged = true;
    return { ...token, initiativeRoll: null, initiativeBonus: null };
  });
  const initiativeOrder = board.initiativeOrder.filter((id) => visibleIds.has(id));
  const orderChanged =
    initiativeOrder.length !== board.initiativeOrder.length ||
    initiativeOrder.some((id, index) => id !== board.initiativeOrder[index]);
  if (!tokensChanged && !orderChanged) {
    return board;
  }
  return {
    ...board,
    tokens,
    initiativeOrder,
    activeIndex: adjustActiveIndexForOrder(initiativeOrder, board.initiativeOrder, board.activeIndex),
  };
}

export function tokenInitiativeVisible(
  token: BattlegroundToken,
  entities: ReadonlyArray<Entity>,
  veils: ReadonlyArray<BattlegroundVeil>,
  unitSize: number,
  cellPx: number,
  boardWidthPx: number,
  boardHeightPx: number,
): boolean {
  if (!isFighterToken(token, entities) || !token.visible) {
    return false;
  }
  return !portraitCoveredByVeils(token, veils, unitSize, cellPx, boardWidthPx, boardHeightPx);
}

export function clearTokenInitiative(tokens: ReadonlyArray<BattlegroundToken>): BattlegroundToken[] {
  return tokens.map((token) => ({
    ...token,
    initiativeRoll: null,
    initiativeBonus: null,
  }));
}

export function adjustActiveIndexForOrder(
  order: ReadonlyArray<TokenId>,
  previousOrder: ReadonlyArray<TokenId>,
  previousIndex: number,
): number {
  const activeId = previousOrder[previousIndex];
  if (activeId === undefined) {
    return 0;
  }
  const nextIndex = order.indexOf(activeId);
  return nextIndex >= 0 ? nextIndex : 0;
}

export function removeTokenFromInitiativeOrder(
  order: ReadonlyArray<TokenId>,
  tokenId: TokenId,
): TokenId[] {
  return order.filter((id) => id !== tokenId);
}
