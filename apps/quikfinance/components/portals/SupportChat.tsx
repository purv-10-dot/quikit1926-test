"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type SupportMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  body: string;
  created_at: string;
};

type SupportTicket = {
  id: string;
  ticket_number: string;
  subject: string;
  priority: string;
  status: string;
  created_at: string;
};

type ChatState = {
  configured: boolean;
  messages: SupportMessage[];
  tickets: SupportTicket[];
};

export function SupportChat({ token, customerName }: { token: string; customerName: string }) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const chat = useQuery({
    queryKey: ["portal-support-chat", token],
    queryFn: async () => {
      const response = await fetch(`/api/public/chat/${token}`);
      const payload = (await response.json()) as { data?: ChatState; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Support chat could not be loaded.");
      }
      return payload.data ?? { configured: false, messages: [], tickets: [] };
    }
  });

  const visibleMessages = useMemo(() => chat.data?.messages ?? [], [chat.data?.messages]);

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 2 || isSending) {
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch(`/api/public/chat/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed })
      });

      const payload = (await response.json()) as {
        error?: { message?: string };
        data?: { ticket?: SupportTicket | null };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Support message could not be sent.");
      }

      setMessage("");
      if (payload.data?.ticket?.ticket_number) {
        toast.success(`Support ticket ${payload.data.ticket.ticket_number} created`);
      }
      await chat.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Support message could not be sent.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Support Assistant</CardTitle>
        <CardDescription>
          Ask about invoices, due dates, payments, statements, or portal access. The assistant can also escalate your issue to the team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!chat.data?.configured ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            AI assistance is not configured yet. If you send a message, QuikFinance will still create a support ticket for your team.
          </div>
        ) : null}

        <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border bg-muted/30 p-3">
          {chat.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading support conversation...</p>
          ) : visibleMessages.length > 0 ? (
            visibleMessages.map((item) => (
              <div
                key={item.id}
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm ${
                  item.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-background text-foreground shadow-sm"
                }`}
              >
                <div className="font-semibold">
                  {item.role === "user" ? customerName : item.role === "assistant" ? "QuikFinance Support" : "System"}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{item.body}</p>
                <p className={`mt-2 text-xs ${item.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(item.created_at).toLocaleString("en-IN")}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-xl bg-background p-4 text-sm text-muted-foreground shadow-sm">
              Hi {customerName}, I can help with invoice status, payment links, statement downloads, and billing questions.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Type your issue here..."
            className="min-h-24"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Try: &quot;Why is invoice INV-0004 overdue?&quot;</p>
            <Button onClick={sendMessage} disabled={isSending || message.trim().length < 2}>
              {isSending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>

        {(chat.data?.tickets?.length ?? 0) > 0 ? (
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-sm font-semibold">Recent Support Tickets</p>
            <div className="mt-3 space-y-2">
              {chat.data?.tickets.map((ticket) => (
                <div key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                  <div>
                    <p className="font-medium">{ticket.ticket_number}</p>
                    <p className="text-muted-foreground">{ticket.subject}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{ticket.status}</p>
                    <p>{new Date(ticket.created_at).toLocaleDateString("en-IN")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
