
const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";

const BATCH_ID = "5b1c2d61-dc49-4dc2-b9a6-92ce716eaeff";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const message = document.getElementById("management-message");
const sessionSelect = document.getElementById("session-select");
const managementList = document.getElementById("management-list");

let adminUser = null;
let registrations = [];

function makeSelect(options, selectedValue) {
    const select = document.createElement("select");

    options.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    });

    select.value = selectedValue || "";
    return select;
}

function makeField(labelText, control) {
    const wrapper = document.createElement("div");
    const label = document.createElement("label");

    label.textContent = labelText;
    wrapper.append(label, control);

    return wrapper;
}

async function verifyAdmin() {
    const { data, error } = await db.auth.getSession();

    if (error || !data.session) {
        window.location.href = "admin.html";
        return false;
    }

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .single();

    if (
        profileError ||
        !["admin", "super_admin"].includes(profile?.role)
    ) {
        await db.auth.signOut();
        window.location.href = "admin.html";
        return false;
    }

    adminUser = data.session.user;
    return true;
}

async function loadSessions() {
    const { data, error } = await db
        .from("course_sessions")
        .select("id, session_title, session_date")
        .eq("batch_id", BATCH_ID)
        .order("session_date");

    if (error) throw error;

    sessionSelect.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a session";
    sessionSelect.appendChild(placeholder);

    (data || []).forEach(session => {
        const option = document.createElement("option");
        option.value = session.id;
        option.textContent =
            `${session.session_title} (${session.session_date})`;
        sessionSelect.appendChild(option);
    });
}

document.getElementById("session-form").addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        const button = document.getElementById("session-button");
        button.disabled = true;

        try {
            const { error } = await db.from("course_sessions").insert({
                batch_id: BATCH_ID,
                session_title: document.getElementById("session-title").value.trim(),
                session_date: document.getElementById("session-date").value,
                description: document.getElementById("session-description").value.trim() || null
            });

            if (error) throw error;

            message.textContent = "Session created successfully.";
            event.target.reset();
            await loadSessions();

        } catch (error) {
            message.textContent = "Session creation failed: " + error.message;
        } finally {
            button.disabled = false;
        }
    }
);

async function loadManagement() {
    const sessionId = sessionSelect.value;
    managementList.replaceChildren();

    if (!sessionId) {
        message.textContent = "Select a session to manage participants.";
        return;
    }

    message.textContent = "Loading participants...";

    try {
        const { data: registrationsData, error: registrationsError } =
            await db.from("registrations")
                .select(`
                    id,
                    registration_number,
                    section,
                    status,
                    participants (
                        full_name,
                        school_troop
                    )
                `)
                .eq("batch_id", BATCH_ID)
                .neq("status", "cancelled")
                .order("registration_number");

        if (registrationsError) throw registrationsError;

        registrations = registrationsData || [];

        const [attendanceResult, completionResult, resultsResult] =
            await Promise.all([
                db.from("attendance")
                    .select("*")
                    .eq("session_id", sessionId),

                db.from("course_completions")
                    .select("*"),

                db.from("results")
                    .select("*")
            ]);

        if (attendanceResult.error) throw attendanceResult.error;
        if (completionResult.error) throw completionResult.error;
        if (resultsResult.error) throw resultsResult.error;

        const attendanceMap = new Map(
            attendanceResult.data.map(item => [item.registration_id, item])
        );

        const completionMap = new Map(
            completionResult.data.map(item => [item.registration_id, item])
        );

        const resultsMap = new Map(
            resultsResult.data.map(item => [item.registration_id, item])
        );

        if (registrations.length === 0) {
            message.textContent = "No registrations found for this batch.";
            return;
        }

        registrations.forEach(registration => {
            const participant = registration.participants || {};
            const attendance = attendanceMap.get(registration.id);
            const completion = completionMap.get(registration.id);
            const result = resultsMap.get(registration.id);

            const card = document.createElement("div");
            card.className = "form-group";

            const heading = document.createElement("h3");
            heading.textContent =
                `${participant.full_name || "Unknown"} — ${registration.registration_number}`;

            const details = document.createElement("p");
            details.textContent =
                `${registration.section} | ${participant.school_troop || "-"} | ${registration.status}`;

            const attendanceSelect = makeSelect([
                ["", "Not recorded"],
                ["present", "Present"],
                ["absent", "Absent"],
                ["excused", "Excused"]
            ], attendance?.attendance_status);

            const completionSelect = makeSelect([
                ["pending", "Pending"],
                ["completed", "Completed"],
                ["not_completed", "Not completed"]
            ], completion?.completion_status || "pending");

            const completionDate = document.createElement("input");
            completionDate.type = "date";
            completionDate.value = completion?.completion_date || "";

            const marks = document.createElement("input");
            marks.type = "number";
            marks.min = "0";
            marks.step = "any";
            marks.placeholder = "Marks";
            marks.value = result?.marks ?? "";

            const grade = document.createElement("input");
            grade.placeholder = "Grade";
            grade.maxLength = 30;
            grade.value = result?.grade || "";

            const remarks = document.createElement("textarea");
            remarks.placeholder = "Result remarks";
            remarks.value = result?.remarks || "";

            const saveButton = document.createElement("button");
            saveButton.type = "button";
            saveButton.textContent = "Save Changes";

            card.append(
                heading,
                details,
                makeField("Attendance", attendanceSelect),
                makeField("Completion status", completionSelect),
                makeField("Completion date", completionDate),
                makeField("Marks", marks),
                makeField("Grade", grade),
                makeField("Remarks", remarks),
                saveButton
            );

            saveButton.addEventListener("click", async () => {
                saveButton.disabled = true;
                saveButton.textContent = "Saving...";

                try {
                    const registrationId = registration.id;

                    if (
                        completionSelect.value === "completed" &&
                        !completionDate.value
                    ) {
                        throw new Error(
                            "Enter a completion date for completed participants."
                        );
                    }

                    if (attendanceSelect.value) {
                        const { error } = await db.from("attendance").upsert({
                            registration_id: registrationId,
                            session_id: sessionId,
                            attendance_status: attendanceSelect.value
                        }, {
                            onConflict: "registration_id,session_id"
                        });

                        if (error) throw error;
                    }

                    const { error: completionError } =
                        await db.from("course_completions").upsert({
                            registration_id: registrationId,
                            completion_status: completionSelect.value,
                            completion_date:
                                completionSelect.value === "completed"
                                    ? completionDate.value
                                    : null,
                            approved_by: adminUser.id,
                            approved_at: new Date().toISOString()
                        }, {
                            onConflict: "registration_id"
                        });

                    if (completionError) throw completionError;

                    const hasResult =
                        marks.value.trim() !== "" ||
                        grade.value.trim() !== "" ||
                        remarks.value.trim() !== "";

                    if (hasResult) {
                        const markValue = marks.value.trim() === ""
                            ? null
                            : Number(marks.value);

                        if (markValue !== null &&
                            (!Number.isFinite(markValue) || markValue < 0)) {
                            throw new Error("Enter valid marks (zero or greater).");
                        }

                        const { error: resultError } =
                            await db.from("results").upsert({
                                registration_id: registrationId,
                                marks: markValue,
                                grade: grade.value.trim() || null,
                                remarks: remarks.value.trim() || null
                            }, {
                                onConflict: "registration_id"
                            });

                        if (resultError) throw resultError;
                    }

                    message.textContent =
                        `Saved: ${registration.registration_number}`;

                    saveButton.textContent = "Saved";

                } catch (error) {
                    message.textContent = "Save failed: " + error.message;
                    saveButton.textContent = "Save Changes";
                } finally {
                    saveButton.disabled = false;
                }
            });

            managementList.appendChild(card);
        });

        message.textContent =
            `Loaded ${registrations.length} participants.`;

    } catch (error) {
        message.textContent = "Loading failed: " + error.message;
    }
}

sessionSelect.addEventListener("change", loadManagement);

async function start() {
    try {
        const allowed = await verifyAdmin();
        if (!allowed) return;

        await loadSessions();
        await loadManagement();

    } catch (error) {
        message.textContent = "System error: " + error.message;
    }
}

start();
