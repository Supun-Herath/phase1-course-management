
const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const message = document.getElementById("participant-message");

async function loadParticipants() {
    const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

    if (sessionError || !sessionData.session) {
        window.location.href = "admin.html";
        return;
    }

    const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("role")
        .eq("id", sessionData.session.user.id)
        .single();

    if (profileError || !["admin", "super_admin"].includes(profile?.role)) {
        await supabaseClient.auth.signOut();
        window.location.href = "admin.html";
        return;
    }

    const { data, error } = await supabaseClient
        .from("registrations")
        .select(`
            registration_number,
            section,
            status,
            participants (
                full_name,
                contact_number,
                school_troop,
                district,
                email
            ),
            course_batches (
                name
            )
        `)
        .order("created_at", { ascending: false });

    if (error) {
        message.textContent = "Could not load participants: " + error.message;
        return;
    }

    if (!data || data.length === 0) {
        message.textContent = "No registrations found.";
        return;
    }

    const list = document.getElementById("participant-list");
    list.innerHTML = "";

    data.forEach((registration) => {
        const participant = registration.participants;

        const card = document.createElement("div");
        const heading = document.createElement("h3");
        const details = document.createElement("p");

        heading.textContent = participant?.full_name || "Unknown participant";

        details.textContent =
            `Registration: ${registration.registration_number} | ` +
            `Section: ${registration.section} | ` +
            `Contact: ${participant?.contact_number || "-"} | ` +
            `School/Troop: ${participant?.school_troop || "-"} | ` +
            `District: ${participant?.district || "-"} | ` +
            `Email: ${participant?.email || "-"} | ` +
            `Status: ${registration.status}`;

        card.appendChild(heading);
        card.appendChild(details);
        list.appendChild(card);
    });

    message.textContent = `Total registrations: ${data.length}`;
}

loadParticipants();
