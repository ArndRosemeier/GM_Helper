import type {
  AiTaskRegistration,
  AmbientRegistration,
  CommandRegistration,
  FeatureModule,
  FeatureRegistry,
  FocusCardRegistration,
  IngestAdapter,
  PlayerSurfaceRegistration,
  RailRegistration,
} from "./types";

export class FeatureRegistryImpl implements FeatureRegistry {
  readonly focusCards: FocusCardRegistration[] = [];
  readonly ambients: AmbientRegistration[] = [];
  readonly rails: RailRegistration[] = [];
  readonly playerSurfaces: PlayerSurfaceRegistration[] = [];
  readonly ingestAdapters: IngestAdapter[] = [];
  readonly aiTasks: AiTaskRegistration[] = [];
  readonly commands: CommandRegistration[] = [];

  registerFocusCard(registration: FocusCardRegistration): void {
    replaceOrPush(this.focusCards, registration, (existing) => existing.tag === registration.tag);
  }

  registerAmbient(registration: AmbientRegistration): void {
    replaceOrPush(this.ambients, registration, (existing) => existing.id === registration.id);
  }

  registerRail(registration: RailRegistration): void {
    replaceOrPush(this.rails, registration, (existing) => existing.id === registration.id);
  }

  registerPlayerSurface(registration: PlayerSurfaceRegistration): void {
    replaceOrPush(this.playerSurfaces, registration, (existing) => existing.id === registration.id);
  }

  registerIngest(adapter: IngestAdapter): void {
    replaceOrPush(this.ingestAdapters, adapter, (existing) => existing.id === adapter.id);
  }

  registerAiTask(task: AiTaskRegistration): void {
    replaceOrPush(this.aiTasks, task, (existing) => existing.id === task.id);
  }

  registerCommand(command: CommandRegistration): void {
    replaceOrPush(this.commands, command, (existing) => existing.id === command.id);
  }

  hasAiTask(id: AiTaskRegistration["id"]): boolean {
    return this.aiTasks.some((task) => task.id === id);
  }
}

function replaceOrPush<T>(list: T[], item: T, same: (existing: T) => boolean): void {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const existing = list[index];
    if (existing !== undefined && same(existing)) {
      list.splice(index, 1);
    }
  }
  list.push(item);
}

export function createRegistry(modules: ReadonlyArray<FeatureModule>): FeatureRegistryImpl {
  const registry = new FeatureRegistryImpl();
  for (const module of modules) {
    module.register(registry);
  }
  return registry;
}

export function focusCardForTag(
  registry: FeatureRegistryImpl,
  tags: ReadonlyArray<string>,
): FocusCardRegistration | null {
  for (const tag of tags) {
    const match = registry.focusCards.find((entry) => entry.tag === tag);
    if (match) {
      return match;
    }
  }
  return registry.focusCards.find((entry) => entry.tag === "*") ?? null;
}
