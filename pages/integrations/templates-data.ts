import { apiSignal } from "../../api";

export type BotTemplate = {
  slug: string;
  name: string;
  category: string;
  integrations: string[];
  prompt: string;
  contributor: string | null;
  url: string;
};

export const templates = apiSignal<BotTemplate[]>("templates", "templates", []);
