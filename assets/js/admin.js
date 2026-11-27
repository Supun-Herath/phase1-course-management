
// Phase 1 Course - Admin Authentication

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const loginForm = document.getElementById("admin-login-form");
const message = document.getElementById("admin-message");
const loginButton = document.getElementById("admin-login-button");
const forgotButton = document.getElementById("forgot-password-button");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    message.textContent = "";
    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";

    try {
        const email = document.getElementById("admin-email").value.trim();
        const password = document.getElementById("admin-password").value;

        const { data, error } = await db.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("role")
            .eq("id", data.user.id)
            .single();

        if (
            profileError ||
            !["admin", "super_admin"].includes(profile?.role)
        ) {
            await db.auth.signOut();
            throw new Error("You are not authorized to access the admin area.");
        }

        window.location.href = "dashboard.html";

    } catch (error) {
        message.textContent = error.message || "Login failed.";
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "Login";
    }
});

forgotButton.addEventListener("click", async () => {
    const email = document.getElementById("admin-email").value.trim();

    if (!email) {
        message.textContent = "Enter your admin email first.";
        return;
    }

    forgotButton.disabled = true;
    message.textContent = "Requesting password recovery...";

    try {
        const { error } = await db.auth.resetPasswordForEmail(email, {
            redirectTo:
                "https://supun-herath.github.io/phase1-course-management/reset-password.html"
        });

        if (error) throw error;

        message.textContent =
            "Recovery email requested. Check your inbox.";

    } catch (error) {
        message.textContent = error.message;
    } finally {
        forgotButton.disabled = false;
    }
});
