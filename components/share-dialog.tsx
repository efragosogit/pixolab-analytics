"use client";

import { useState, useTransition } from "react";
import { ClockIcon, Share2Icon, XIcon } from "lucide-react";
import type { Collaborator } from "@/lib/auth/users";
import {
  getCollaboratorsAction,
  inviteCollaboratorAction,
  revokeCollaboratorAction,
} from "@/app/(dashboard)/[client]/share-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Drive-style "who has access" dialog. `canManage` gates invite/revoke to
 * the Pixolab team (see lib/auth/users.ts's `canManageAccess`) — everyone
 * else with access can open this to see who else is on the dashboard, but
 * the form/remove buttons are hidden for them.
 */
export function ShareDialog({
  client,
  clientDisplayName,
  collaborators: initialCollaborators,
  canManage,
  currentUserId,
}: {
  client: string;
  clientDisplayName: string;
  collaborators: Collaborator[];
  canManage: boolean;
  currentUserId: string;
}) {
  // Owns its own copy after the first render — refreshed by directly
  // re-fetching (see share-actions.ts's comment on why), not by the
  // server layout re-rendering and passing new props down.
  const [collaborators, setCollaborators] = useState(initialCollaborators);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null); // "invite" | userId being revoked
  const [pending, startTransition] = useTransition();

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPendingAction("invite");
    startTransition(async () => {
      const result = await inviteCollaboratorAction(client, email);
      if (result.ok) {
        setEmail("");
        setCollaborators(await getCollaboratorsAction(client));
      } else {
        setError(result.error ?? "No se pudo invitar.");
      }
      setPendingAction(null);
    });
  }

  function handleRevoke(userId: string) {
    setError(null);
    setPendingAction(userId);
    startTransition(async () => {
      const result = await revokeCollaboratorAction(client, userId);
      if (result.ok) {
        setCollaborators(await getCollaboratorsAction(client));
      } else {
        setError(result.error ?? "No se pudo quitar el acceso.");
      }
      setPendingAction(null);
    });
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="default">
            <Share2Icon />
            Compartir
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartir dashboard</DialogTitle>
          <DialogDescription>
            Personas con acceso al dashboard de {clientDisplayName}. Todo el equipo de Pixolab
            (@pixolab.com.mx) tiene acceso automático y no aparece en esta lista.
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <form onSubmit={handleInvite} className="flex items-center gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
              className="flex-1"
            />
            <Button type="submit" disabled={pending && pendingAction === "invite"}>
              {pending && pendingAction === "invite" ? "Invitando…" : "Invitar"}
            </Button>
          </form>
        )}

        {error && <p className="text-xs text-status-critical">{error}</p>}

        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {collaborators.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40"
            >
              <Avatar size="sm">
                <AvatarFallback>{c.email[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {c.email}
                  {c.id === currentUserId && (
                    <span className="ml-1.5 text-xs text-muted-foreground">(tú)</span>
                  )}
                </p>
                {c.invitedBy && (
                  <p className="truncate text-xs text-muted-foreground">
                    Invitado por {c.invitedBy}
                  </p>
                )}
              </div>
              {c.status === "pending" ? (
                <Badge
                  variant="outline"
                  className="shrink-0 border-dashed border-border text-muted-foreground"
                >
                  <ClockIcon className="size-3" />
                  Pendiente
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="shrink-0 border-status-good/30 bg-status-good/10 text-status-good"
                >
                  Activo
                </Badge>
              )}
              {canManage && c.id !== currentUserId && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending && pendingAction === c.id}
                  onClick={() => handleRevoke(c.id)}
                  aria-label={`Quitar acceso a ${c.email}`}
                >
                  <XIcon />
                </Button>
              )}
            </div>
          ))}
          {collaborators.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Todavía no has invitado a nadie.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
