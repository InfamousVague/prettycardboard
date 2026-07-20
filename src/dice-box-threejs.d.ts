declare module '@3d-dice/dice-box-threejs' {
  interface DiceBoxConfig {
    framerate?: number;
    sounds?: boolean;
    volume?: number;
    shadows?: boolean;
    theme_surface?: string;
    theme_material?: 'none' | 'metal' | 'wood' | 'glass' | 'plastic';
    theme_texture?: string;
    theme_colorset?: string;
    theme_customColorset?: {
      background?: string | string[];
      foreground?: string;
      texture?: string;
      material?: string;
      edge?: string;
    } | null;
    gravity_multiplier?: number;
    light_intensity?: number;
    baseScale?: number;
    strength?: number;
    assetPath?: string;
    onRollComplete?: (results: unknown) => void;
  }

  export default class DiceBox {
    constructor(selector: string, config?: DiceBoxConfig);
    initialize(): Promise<void>;
    roll(notation: string): Promise<unknown>;
    clearDice(): void;
    clear(): void;
    reset(): void;
    updateConfig(config: DiceBoxConfig): Promise<void>;
    setDimensions(dimensions: { w: number; h: number }): void;
  }
}
