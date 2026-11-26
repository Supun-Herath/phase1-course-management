
const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const message = document.getElementById("dashboard-message");
const logoutButton = document.getElementById("logout-button");

async function checkAdminAccess() {
    const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

    if (sessionError || !sessionData.session) {
        window.location.href = "admin.html";
        return;
    }

    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("role")
        .eq("id", sessionData.session.user.id)
        .single();

    if (error || !["admin", "super_admin"].includes(profile?.role)) {
        await supabaseClient.auth.signOut();
        window.location.href = "admin.html";
        return;
    }

    message.textContent = "Welcome, administrator.";
}

logoutButton.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "admin.html";
});

checkAdminAccess();
