import bcrypt from "bcryptjs";
import AdminJSExpress from "@adminjs/express";
import adminJs from "./admin.config.ts"; // tu instancia de AdminJS

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_HASH = process.env.ADMIN_HASH!; // hash guardado en .env

const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
  adminJs,
  {
    authenticate: async (email, password) => {
      if (email !== ADMIN_EMAIL) return null;
      const ok = await bcrypt.compare(password, ADMIN_HASH);
      return ok ? { email: ADMIN_EMAIL } : null;
    },
    cookieName: "adminjs",
    cookiePassword: process.env.COOKIE_SECRET || "un-secreto-corto",
  },
  null,
  { resave: false, saveUninitialized: true }
);

export default adminRouter;
