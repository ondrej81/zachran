import { z } from "zod";

const Server = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  APP_USERNAME: z.string().default("zena"),
  APP_PASSWORD: z.string().min(1),
  CRON_SECRET: z.string().min(8).optional(),
});

let _env: z.infer<typeof Server> | undefined;
export function env() {
  if (!_env) _env = Server.parse(process.env);
  return _env;
}
