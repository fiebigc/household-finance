import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const admin = createClient(url, serviceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const users = [
  'heli.vauhkala@gmail.com',
  'fiebigc@gmail.com',
];

const password = '277087';

for (const email of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    if (error.message?.toLowerCase().includes('already')) {
      const { data: listed, error: listError } = await admin.auth.admin.listUsers();
      if (listError) {
        console.error(`Could not list users for ${email}:`, listError.message);
        continue;
      }
      const existing = listed.users.find(
        (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
      );
      if (!existing) {
        console.error(`User exists but could not resolve by email: ${email}`);
        continue;
      }
      const { error: updateError } = await admin.auth.admin.updateUserById(
        existing.id,
        {
          password,
          email_confirm: true,
        },
      );
      if (updateError) {
        console.error(`Failed to reset password for ${email}:`, updateError.message);
      } else {
        console.log(`Password reset to default for existing user: ${email}`);
      }
      continue;
    }
    console.error(`Failed for ${email}:`, error.message);
    continue;
  }

  console.log(`Created user: ${email} (${data.user?.id ?? 'no-id'})`);
}
