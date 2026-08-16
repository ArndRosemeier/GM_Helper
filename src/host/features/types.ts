import type { ComponentType } from "react";
import type { Entity } from "../types";

export type FocusCardProps = {
  entity: Entity;
  revealSecrets: boolean;
};

export type FocusCardRegistration = {
  tag: string;
  component: ComponentType<FocusCardProps>;
};

export type AmbientRegistration = {
  id: string;
  component: ComponentType;
};

export type RailRegistration = {
  id: string;
  title: string;
  component: ComponentType;
};

export type PlayerSurfaceRegistration = {
  id: string;
  component: ComponentType;
};

export type IngestAdapter = {
  id: string;
  label: string;
  accept: ReadonlyArray<string>;
  ingest: (file: File) => Promise<void>;
};

export type AiTaskId =
  | "generateNpc"
  | "generatePortrait"
  | "generateToken"
  | "liftRunCard"
  | "sketchBattleground";

export type AiTaskRegistration = {
  id: AiTaskId;
  label: string;
  tableAllowed: boolean;
};

export type CommandRegistration = {
  id: string;
  title: string;
  keywords: ReadonlyArray<string>;
  run: () => void;
};

export type FeatureModule = {
  id: string;
  register: (registry: FeatureRegistry) => void;
};

export type FeatureRegistry = {
  registerFocusCard: (registration: FocusCardRegistration) => void;
  registerAmbient: (registration: AmbientRegistration) => void;
  registerRail: (registration: RailRegistration) => void;
  registerPlayerSurface: (registration: PlayerSurfaceRegistration) => void;
  registerIngest: (adapter: IngestAdapter) => void;
  registerAiTask: (task: AiTaskRegistration) => void;
  registerCommand: (command: CommandRegistration) => void;
  hasAiTask: (id: AiTaskId) => boolean;
};
