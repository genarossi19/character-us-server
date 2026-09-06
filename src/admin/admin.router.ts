import bcrypt from "bcryptjs";
import AdminJSExpress from "@adminjs/express";
import adminJs from "../admin/admin.config.ts";
import { env } from "../config/env.ts";

const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
  adminJs,
  {
    authenticate: async (email, password) => {
      if (email !== env.ADMIN_EMAIL) return null;
      const ok = await bcrypt.compare(password, env.ADMIN_HASH);
      return ok ? { email: env.ADMIN_EMAIL } : null;
    },
    cookieName: "adminjs",
    cookiePassword: env.COOKIE_SECRET,
  },
  null,
  { resave: false, saveUninitialized: true }
);

export default adminRouter;
