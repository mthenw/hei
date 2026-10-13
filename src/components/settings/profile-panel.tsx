"use client";

import { LocateFixedIcon, RotateCcwIcon } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getProfile, updateProfile } from "@/lib/chat-api";
import type { ProfileData } from "@/profile/profile";

const SAME_AS_MESSAGE = "same";
const LANGUAGES = [
  "English",
  "Polski",
  "Deutsch",
  "Español",
  "Français",
  "Italiano",
  "Português",
  "Nederlands",
  "Українська",
];

type Form = {
  about: string;
  timeZone: string;
  replyLanguage: string;
  instructions: string;
};

export function ProfilePanel() {
  const [saved, setSaved] = useState<ProfileData>();
  const [defaultInstructions, setDefaultInstructions] = useState("");
  const [form, setForm] = useState<Form>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    getProfile()
      .then(({ profile, defaultInstructions }) => {
        setSaved(profile);
        setDefaultInstructions(defaultInstructions);
        setForm(toForm(profile, defaultInstructions));
      })
      .catch((cause) => setError(String(cause)));
  }, []);

  const timeZones = useMemo(() => {
    const zones = Intl.supportedValuesOf("timeZone");
    return form && !zones.includes(form.timeZone)
      ? [form.timeZone, ...zones]
      : zones;
  }, [form]);

  if (form === undefined || saved === undefined)
    return (
      <div className="flex justify-center p-8 text-muted-foreground">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <Spinner />
        )}
      </div>
    );

  const change = changeFrom(saved, form, defaultInstructions);
  const dirty = Object.keys(change).length > 0;
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const set = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setJustSaved(false);
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const profile = await updateProfile(change);
      setSaved(profile);
      setForm(toForm(profile, defaultInstructions));
      setJustSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-8"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          What Hei knows about you and how it behaves. Changes apply from your
          next message, in every chat.
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>About you</CardTitle>
          <CardDescription>
            Added to every chat. Where you live, what you do, the people and
            places you mention often.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="about" className="sr-only">
              About you
            </FieldLabel>
            <Textarea
              id="about"
              rows={5}
              value={form.about}
              onChange={(event) => set({ about: event.target.value })}
              placeholder="I live in Poznań, work as a software engineer, and cycle to work."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time and language</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="time-zone">Time zone</FieldLabel>
              <div className="flex gap-2">
                <Select
                  value={form.timeZone}
                  onValueChange={(timeZone) => set({ timeZone })}
                >
                  <SelectTrigger id="time-zone" className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {timeZones.map((zone) => (
                        <SelectItem key={zone} value={zone}>
                          {zone.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {deviceTimeZone !== form.timeZone && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => set({ timeZone: deviceTimeZone })}
                  >
                    <LocateFixedIcon data-icon="inline-start" />
                    Use {deviceTimeZone.replaceAll("_", " ")}
                  </Button>
                )}
              </div>
              <FieldDescription>
                For “today”, “tonight” and the time Hei sees on your messages.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="reply-language">Reply language</FieldLabel>
              <Select
                value={form.replyLanguage}
                onValueChange={(replyLanguage) => set({ replyLanguage })}
              >
                <SelectTrigger id="reply-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={SAME_AS_MESSAGE}>
                      Same as my message
                    </SelectItem>
                    {[...new Set([...LANGUAGES, form.replyLanguage])]
                      .filter((language) => language !== SAME_AS_MESSAGE)
                      .map((language) => (
                        <SelectItem key={language} value={language}>
                          {language}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assistant instructions</CardTitle>
          <CardDescription>
            How Hei should behave: tone, length, what to ask before acting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="instructions" className="sr-only">
              Assistant instructions
            </FieldLabel>
            <Textarea
              id="instructions"
              rows={5}
              value={form.instructions}
              onChange={(event) => set({ instructions: event.target.value })}
            />
            {form.instructions.trim() !== defaultInstructions && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => set({ instructions: defaultInstructions })}
              >
                <RotateCcwIcon data-icon="inline-start" />
                Reset to default
              </Button>
            )}
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || saving}>
          {saving && <Spinner data-icon="inline-start" />}
          Save
        </Button>
        {justSaved && !dirty && (
          <span className="text-sm text-muted-foreground">Saved</span>
        )}
      </div>
    </form>
  );
}

function toForm(profile: ProfileData, defaultInstructions: string): Form {
  return {
    about: profile.about,
    timeZone: profile.timeZone,
    replyLanguage: profile.replyLanguage ?? SAME_AS_MESSAGE,
    instructions: profile.instructions ?? defaultInstructions,
  };
}

/** Only the fields that differ from what is saved; default text is saved as "use the default". */
function changeFrom(
  saved: ProfileData,
  form: Form,
  defaultInstructions: string,
): Partial<ProfileData> {
  const replyLanguage =
    form.replyLanguage === SAME_AS_MESSAGE ? null : form.replyLanguage;
  const instructions =
    form.instructions.trim() === defaultInstructions ||
    form.instructions.trim() === ""
      ? null
      : form.instructions;
  const change: Partial<ProfileData> = {};
  if (form.about.trim() !== saved.about) change.about = form.about;
  if (form.timeZone !== saved.timeZone) change.timeZone = form.timeZone;
  if (replyLanguage !== saved.replyLanguage)
    change.replyLanguage = replyLanguage;
  if ((instructions?.trim() ?? null) !== saved.instructions)
    change.instructions = instructions;
  return change;
}
