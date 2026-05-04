/**
 * In-memory user profile store (default; plug SQLite/Postgres for production).
 */

import type { EntityId } from '@confused-ai/core';
import type { UserProfile, UserProfileQuery } from './types.js';

export class InMemoryUserProfileStore {
    private profiles = new Map<string, UserProfile>();

    private key(userId: string, agentId?: EntityId): string {
        return agentId ? `${userId}:${agentId}` : userId;
    }

    async get(userId: string, agentId?: EntityId): Promise<UserProfile | null> {
        return this.profiles.get(this.key(userId, agentId)) ?? null;
    }

    async set(profile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserProfile> {
        const now = new Date();
        const id = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const entry: UserProfile = {
            ...profile,
            id,
            createdAt: now,
            updatedAt: now,
        };
        this.profiles.set(this.key(profile.userId, profile.agentId), entry);
        return entry;
    }

    async update(
        userId: string,
        updates: Partial<Omit<UserProfile, 'id' | 'userId' | 'createdAt'>>,
        agentId?: EntityId
    ): Promise<UserProfile> {
        const existing = await this.get(userId, agentId);
        if (!existing) {
            const now = new Date();
            const entry: UserProfile = {
                id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                userId,
                agentId,
                metadata: (updates.metadata as Record<string, unknown>) ?? {},
                createdAt: now,
                updatedAt: now,
                ...updates,
            };
            this.profiles.set(this.key(userId, agentId), entry);
            return entry;
        }
        const updated: UserProfile = {
            ...existing,
            ...updates,
            updatedAt: new Date(),
        };
        this.profiles.set(this.key(userId, agentId), updated);
        return updated;
    }

    async list(query?: UserProfileQuery): Promise<UserProfile[]> {
        let list = Array.from(this.profiles.values());
        if (query?.userId) list = list.filter(p => p.userId === query.userId);
        if (query?.agentId) list = list.filter(p => p.agentId === query.agentId);
        if (query?.limit) list = list.slice(0, query.limit);
        return list;
    }

    async delete(userId: string, agentId?: EntityId): Promise<boolean> {
        return this.profiles.delete(this.key(userId, agentId));
    }
}
