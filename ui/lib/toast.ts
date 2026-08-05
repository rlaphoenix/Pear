import { toast as rt } from "react-toastify";

export interface ToastMsg {
  kind: "success" | "error";
  msg: string;
}

export function toast({ kind, msg }: ToastMsg): void {
  if (kind === "success") rt.success(msg);
  else rt.error(msg);
}
