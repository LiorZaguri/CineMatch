import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { prisma } from "../prisma";
import { env } from "../config/env";

const SALT_ROUNDS = 10;

export class AuthError extends Error {
  constructor(
    public code:
      | "EMAIL_ALREADY_EXISTS"
      | "INVALID_CREDENTIALS"
      | "USER_NOT_FOUND"
      | "INVALID_PASSWORD"
      | "INVALID_ONBOARDING_STATUS",
  ) {
    super(code);
  }
}

export type OnboardingStatus = "pending" | "completed" | "skipped";

type SafeUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  onboardingStatus: OnboardingStatus;
};

type AuthResponse = {
  accessToken: string;
  user: SafeUser;
};

const safeUserSelect = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  onboardingStatus: true,
} as const;

function getJwtSignOptions(): SignOptions {
  return {
    expiresIn: env.JWT_EXPIRES_IN as NonNullable<SignOptions["expiresIn"]>,
  };
}

function signAccessToken(user: SafeUser): string {
  return jwt.sign({ sub: user.id, email: user.email }, env.JWT_SECRET, getJwtSignOptions());
}

function toSafeUser(user: {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  onboardingStatus: string;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    onboardingStatus: user.onboardingStatus as OnboardingStatus,
  };
}

export async function registerUser(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResponse> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
      select: safeUserSelect,
    });

    const safeUser = toSafeUser(user);
    return { accessToken: signAccessToken(safeUser), user: safeUser };
  } catch (err: any) {
    if (err?.code === "P2002") {
      throw new AuthError("EMAIL_ALREADY_EXISTS");
    }

    throw err;
  }
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...safeUserSelect, passwordHash: true },
  });

  if (!user) {
    throw new AuthError("INVALID_CREDENTIALS");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new AuthError("INVALID_CREDENTIALS");
  }

  const accessToken = jwt.sign(
    { sub: user.id, email: user.email },
    env.JWT_SECRET,
    getJwtSignOptions(),
  );

  return {
    accessToken,
    user: toSafeUser(user),
  };
}

export async function updateUserProfile(userId: string, displayName: string): Promise<SafeUser> {
  try {
    return toSafeUser(await prisma.user.update({
      where: { id: userId },
      data: { displayName },
      select: safeUserSelect,
    }));
  } catch (err: any) {
    if (err?.code === "P2025") {
      throw new AuthError("USER_NOT_FOUND");
    }

    throw err;
  }
}

export async function updateUserOnboardingStatus(
  userId: string,
  onboardingStatus: OnboardingStatus,
): Promise<SafeUser> {
  if (!["pending", "completed", "skipped"].includes(onboardingStatus)) {
    throw new AuthError("INVALID_ONBOARDING_STATUS");
  }

  try {
    return toSafeUser(await prisma.user.update({
      where: { id: userId },
      data: { onboardingStatus },
      select: safeUserSelect,
    }));
  } catch (err: any) {
    if (err?.code === "P2025") {
      throw new AuthError("USER_NOT_FOUND");
    }

    throw err;
  }
}

export async function changeUserPassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    throw new AuthError("USER_NOT_FOUND");
  }

  const matches = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!matches) {
    throw new AuthError("INVALID_PASSWORD");
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

export async function deleteUserAccount(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    throw new AuthError("USER_NOT_FOUND");
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new AuthError("INVALID_PASSWORD");
  }

  await prisma.user.delete({
    where: { id: userId },
  });
}

export async function updateUserAvatar(userId: string, avatarUrl: string): Promise<SafeUser> {
  try {
    return toSafeUser(await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: safeUserSelect,
    }));
  } catch (err: any) {
    if (err?.code === "P2025") {
      throw new AuthError("USER_NOT_FOUND");
    }

    throw err;
  }
}

export async function getUsersByIds(userIds: string[]): Promise<SafeUser[]> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      id: {
        in: uniqueIds,
      },
    },
    select: safeUserSelect,
  });

  return users.map(toSafeUser);
}
