/// <reference types="@sveltejs/kit" />

import type { AuthContext } from "$lib/server/auth.js";

declare global {
  namespace App {
    interface Locals {
      auth: AuthContext;
    }
  }
}

export {};
