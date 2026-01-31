
import { db } from "./db";
import { contacts, sessions, type InsertContact, type Contact } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  createContact(contact: InsertContact): Promise<Contact>;
  getContactByPhone(phoneNumber: string): Promise<Contact | undefined>;
  saveSession(id: string, data: string): Promise<void>;
  getSession(id: string): Promise<string | undefined>;
  deleteSession(id: string): Promise<void>;
  getAllContacts(): Promise<Contact[]>;
}

export class DatabaseStorage implements IStorage {
  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).onConflictDoNothing().returning();
    if (!newContact) {
      // If conflict, return existing
      const existing = await this.getContactByPhone(contact.phoneNumber);
      return existing!;
    }
    return newContact;
  }

  async getContactByPhone(phoneNumber: string): Promise<Contact | undefined> {
    return await db.query.contacts.findFirst({
      where: eq(contacts.phoneNumber, phoneNumber),
    });
  }

  async getAllContacts(): Promise<Contact[]> {
    return await db.select().from(contacts);
  }

  // Session storage helpers
  async saveSession(id: string, data: string): Promise<void> {
    await db.insert(sessions)
      .values({ id, data })
      .onConflictDoUpdate({ target: sessions.id, set: { data, updatedAt: new Date() } });
  }

  async getSession(id: string): Promise<string | undefined> {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    return session?.data;
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
}

export const storage = new DatabaseStorage();
