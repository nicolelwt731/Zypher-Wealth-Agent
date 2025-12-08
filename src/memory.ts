import { join } from "@std/path";

export interface UserMemory {
  risk_tolerance?: string; // e.g., "High", "Low"
  last_interaction?: string;
  investment_focus?: string; // e.g., "Tech", "Crypto"
}

export class MemoryManager {
  private dbPath: string;

  constructor(filename: string = "agent_memory.json") {
    this.dbPath = join(Deno.cwd(), "src", "data", filename);
  }

  // 读取记忆
  async loadMemory(): Promise<UserMemory> {
    try {
      const data = await Deno.readTextFile(this.dbPath);
      return JSON.parse(data);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // 如果文件不存在，返回空记忆
        return {};
      }
      throw error;
    }
  }

  // 写入/更新记忆
  async saveMemory(newMemory: Partial<UserMemory>): Promise<void> {
    const current = await this.loadMemory();
    const updated = {
      ...current,
      ...newMemory,
      last_interaction: new Date().toISOString(),
    };

    // 确保目录存在
    await Deno.mkdir(join(Deno.cwd(), "src", "data"), { recursive: true });

    await Deno.writeTextFile(this.dbPath, JSON.stringify(updated, null, 2));
    console.log(`💾 [Memory] Updated: ${JSON.stringify(newMemory)}`);
  }
}
