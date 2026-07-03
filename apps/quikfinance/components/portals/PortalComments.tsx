"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";

type CommentRow = {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export function PortalComments({ token }: { token: string }) {
  const { t } = useI18n();
  const [body, setBody] = useState("");

  const comments = useQuery({
    queryKey: ["portal-comments", token],
    queryFn: async () => {
      const response = await fetch(`/api/public/portal/${token}/comments`);
      const payload = (await response.json()) as { data?: CommentRow[] };
      return payload.data ?? [];
    }
  });

  const submit = async () => {
    const response = await fetch(`/api/public/portal/${token}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });

    if (!response.ok) {
      toast.error("Comment could not be saved.");
      return;
    }

    setBody("");
    comments.refetch();
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t("portals.comments", "Comments")}</h3>
      <div className="space-y-3">
        {(comments.data ?? []).length > 0 ? (
          comments.data?.map((comment) => (
            <div key={comment.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{comment.author_name}</span>
                <span className="text-muted-foreground">{new Date(comment.created_at).toLocaleString("en-IN")}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{comment.body}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{t("portals.noComments", "No comments yet.")}</p>
        )}
      </div>
      <div className="space-y-2">
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("portals.addComment", "Add comment")} />
        <Button onClick={submit} disabled={body.trim().length < 2}>
          {t("portals.addComment", "Add comment")}
        </Button>
      </div>
    </div>
  );
}
