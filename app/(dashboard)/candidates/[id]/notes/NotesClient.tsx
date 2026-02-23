"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, MessageSquare, Voicemail, Trash2, Edit, Save, X, Plus } from "lucide-react";

interface Note {
  id: string;
  content: string;
  callAnswered?: boolean | null;
  voicemailLeft?: boolean | null;
  smsSent?: boolean | null;
  emailSent?: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

interface NotesClientProps {
  candidateId: string;
  initialNotes: Note[];
}

export default function NotesClient({
  candidateId,
  initialNotes,
}: NotesClientProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Activity tracking state for new notes
  const [callAnswered, setCallAnswered] = useState(false);
  const [voicemailLeft, setVoicemailLeft] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Activity tracking state for editing notes
  const [editCallAnswered, setEditCallAnswered] = useState(false);
  const [editVoicemailLeft, setEditVoicemailLeft] = useState(false);
  const [editSmsSent, setEditSmsSent] = useState(false);
  const [editEmailSent, setEditEmailSent] = useState(false);

  const handleCreateNote = async () => {
    // Require at least a note OR an activity to be selected
    const hasActivity = callAnswered || voicemailLeft || smsSent || emailSent;
    if (!newNote.trim() && !hasActivity) {
      setError("Please add a note or select at least one activity");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newNote.trim() || "",
          callAnswered: callAnswered || undefined,
          voicemailLeft: voicemailLeft || undefined,
          smsSent: smsSent || undefined,
          emailSent: emailSent || undefined,
        }),
      });

      if (!response.ok) throw new Error("Failed to create note");

      const note = await response.json();
      setNotes([note, ...notes]);
      setNewNote("");
      setCallAnswered(false);
      setVoicemailLeft(false);
      setSmsSent(false);
      setEmailSent(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to create note");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    // Require at least a note OR an activity to be selected
    const hasActivity = editCallAnswered || editVoicemailLeft || editSmsSent || editEmailSent;
    if (!editContent.trim() && !hasActivity) {
      setError("Please add a note or select at least one activity");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/candidates/${candidateId}/notes/${noteId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: editContent.trim() || "",
            callAnswered: editCallAnswered || undefined,
            voicemailLeft: editVoicemailLeft || undefined,
            smsSent: editSmsSent || undefined,
            emailSent: editEmailSent || undefined,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to update note");

      const updatedNote = await response.json();
      setNotes(notes.map((n) => (n.id === noteId ? updatedNote : n)));
      setEditingId(null);
      setEditContent("");
      setEditCallAnswered(false);
      setEditVoicemailLeft(false);
      setEditSmsSent(false);
      setEditEmailSent(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update note");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this note?")) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/candidates/${candidateId}/notes/${noteId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to delete note");

      setNotes(notes.filter((n) => n.id !== noteId));
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to delete note");
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (note: Note) => {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditCallAnswered(note.callAnswered ?? false);
    setEditVoicemailLeft(note.voicemailLeft ?? false);
    setEditSmsSent(note.smsSent ?? false);
    setEditEmailSent(note.emailSent ?? false);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent("");
    setEditCallAnswered(false);
    setEditVoicemailLeft(false);
    setEditSmsSent(false);
    setEditEmailSent(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {error && (
        <div className="bg-destructive/15 border border-destructive/30 text-destructive px-4 py-3 rounded-lg">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Create new note */}
      <Card className="border-2 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Activity Note
          </CardTitle>
          <CardDescription>
            Track your interactions and add private notes about this candidate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Activity Tracking Checkboxes */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="new-call"
                checked={callAnswered}
                onCheckedChange={(checked) => setCallAnswered(checked === true)}
                disabled={loading}
              />
              <label
                htmlFor="new-call"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
              >
                <Phone className="h-4 w-4 text-green-600" />
                Call Answered
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="new-voicemail"
                checked={voicemailLeft}
                onCheckedChange={(checked) => setVoicemailLeft(checked === true)}
                disabled={loading}
              />
              <label
                htmlFor="new-voicemail"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
              >
                <Voicemail className="h-4 w-4 text-yellow-600" />
                Voicemail Left
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="new-sms"
                checked={smsSent}
                onCheckedChange={(checked) => setSmsSent(checked === true)}
                disabled={loading}
              />
              <label
                htmlFor="new-sms"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
              >
                <MessageSquare className="h-4 w-4 text-blue-600" />
                SMS Sent
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="new-email"
                checked={emailSent}
                onCheckedChange={(checked) => setEmailSent(checked === true)}
                disabled={loading}
              />
              <label
                htmlFor="new-email"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
              >
                <Mail className="h-4 w-4 text-purple-600" />
                Email Sent
              </label>
            </div>
          </div>

          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Write a private note about this candidate (optional)..."
            className="min-h-[120px] resize-none"
            disabled={loading}
          />
          
          <div className="flex justify-end">
            <Button
              onClick={handleCreateNote}
              disabled={loading || (!newNote.trim() && !callAnswered && !voicemailLeft && !smsSent && !emailSent)}
              size="lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              {loading ? "Adding..." : "Add Note"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes list */}
      <div className="space-y-4">
        {notes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-6xl mb-4 opacity-20">📝</div>
              <p className="text-lg font-medium text-muted-foreground">No notes yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first activity note above
              </p>
            </CardContent>
          </Card>
        ) : (
          notes.map((note) => (
            <Card key={note.id} className="border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                {editingId === note.id ? (
                  <div className="space-y-4">
                    {/* Activity Tracking Checkboxes for editing */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-call-${note.id}`}
                          checked={editCallAnswered}
                          onCheckedChange={(checked) => setEditCallAnswered(checked === true)}
                          disabled={loading}
                        />
                        <label
                          htmlFor={`edit-call-${note.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
                        >
                          <Phone className="h-4 w-4 text-green-600" />
                          Call Answered
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-voicemail-${note.id}`}
                          checked={editVoicemailLeft}
                          onCheckedChange={(checked) => setEditVoicemailLeft(checked === true)}
                          disabled={loading}
                        />
                        <label
                          htmlFor={`edit-voicemail-${note.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
                        >
                          <Voicemail className="h-4 w-4 text-yellow-600" />
                          Voicemail Left
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-sms-${note.id}`}
                          checked={editSmsSent}
                          onCheckedChange={(checked) => setEditSmsSent(checked === true)}
                          disabled={loading}
                        />
                        <label
                          htmlFor={`edit-sms-${note.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
                        >
                          <MessageSquare className="h-4 w-4 text-blue-600" />
                          SMS Sent
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-email-${note.id}`}
                          checked={editEmailSent}
                          onCheckedChange={(checked) => setEditEmailSent(checked === true)}
                          disabled={loading}
                        />
                        <label
                          htmlFor={`edit-email-${note.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
                        >
                          <Mail className="h-4 w-4 text-purple-600" />
                          Email Sent
                        </label>
                      </div>
                    </div>

                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[120px] resize-none"
                      disabled={loading}
                    />
                    
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={cancelEditing}
                        disabled={loading}
                        variant="outline"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        onClick={() => handleUpdateNote(note.id)}
                        disabled={loading || (!editContent.trim() && !editCallAnswered && !editVoicemailLeft && !editSmsSent && !editEmailSent)}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {loading ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground mb-2">
                          {new Date(note.createdAt).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {/* Display activity badges */}
                        {(note.callAnswered || note.voicemailLeft || note.smsSent || note.emailSent) && (
                          <div className="flex flex-wrap gap-2">
                            {note.callAnswered && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <Phone className="h-3 w-3 mr-1" />
                                Call Answered
                              </Badge>
                            )}
                            {note.voicemailLeft && (
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                <Voicemail className="h-3 w-3 mr-1" />
                                Voicemail Left
                              </Badge>
                            )}
                            {note.smsSent && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                <MessageSquare className="h-3 w-3 mr-1" />
                                SMS Sent
                              </Badge>
                            )}
                            {note.emailSent && (
                              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                <Mail className="h-3 w-3 mr-1" />
                                Email Sent
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          onClick={() => startEditing(note)}
                          variant="ghost"
                          size="sm"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => handleDeleteNote(note.id)}
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                      {note.content}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
