
const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";
const BATCH_ID = "5b1c2d61-dc49-4dc2-b9a6-92ce716eaeff";
const BUCKET = "phase1-result-pdfs";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const message = document.getElementById("management-message");
const sessionSelect = document.getElementById("session-select");
const managementList = document.getElementById("management-list");
const searchInput = document.getElementById("participant-search");

let adminUser = null;
let participants = [];

function showMessage(text) {
    message.textContent = text;
}

function localDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function safeFilename(name) {
    return (name || "Participant")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "Participant";
}

function makeElement(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
}

function makeField(labelText, control) {
    const wrapper = makeElement("div", undefined, "form-group");
    const label = makeElement("label", labelText);
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

    const placeholder = makeElement("option", "Choose a session");
    placeholder.value = "";
    sessionSelect.appendChild(placeholder);

    (data || []).forEach(session => {
        const option = makeElement(
            "option",
            `${session.session_title} (${session.session_date})`
        );
        option.value = session.id;
        sessionSelect.appendChild(option);
    });
}

document.getElementById("session-form").addEventListener("submit", async event => {
    event.preventDefault();

    const button = document.getElementById("session-button");
    button.disabled = true;

    try {
        const { error } = await db.from("course_sessions").insert({
            batch_id: BATCH_ID,
            session_title: document.getElementById("session-title").value.trim(),
            session_date: document.getElementById("session-date").value,
            description:
                document.getElementById("session-description").value.trim() || null
        });

        if (error) throw error;

        event.target.reset();
        await loadSessions();
        showMessage("Session created successfully.");
    } catch (error) {
        showMessage("Session creation failed: " + error.message);
    } finally {
        button.disabled = false;
    }
});

async function loadParticipants() {
    managementList.replaceChildren();
    showMessage("Loading registered participants...");

    try {
        const { data, error } = await db
            .from("registrations")
            .select(`
                id,
                registration_number,
                section,
                status,
                participants (
                    full_name,
                    school_troop,
                    district
                )
            `)
            .eq("batch_id", BATCH_ID)
            .neq("status", "cancelled")
            .order("registration_number");

        if (error) throw error;

        participants = data || [];

        renderParticipants();
    } catch (error) {
        showMessage("Loading failed: " + error.message);
    }
}

function renderParticipants() {
    managementList.replaceChildren();

    const search = searchInput.value.trim().toLowerCase();

    const filtered = participants.filter(registration => {
        const person = registration.participants || {};
        const name = person.full_name || "";
        const number = registration.registration_number || "";

        return (
            name.toLowerCase().includes(search) ||
            number.toLowerCase().includes(search)
        );
    });

    if (!filtered.length) {
        showMessage(
            participants.length
                ? "No matching participants found."
                : "No registrations found for this batch."
        );
        return;
    }

    showMessage(`Showing ${filtered.length} participant(s).`);

    filtered.forEach(registration => {
        const person = registration.participants || {};
        const card = makeElement("div", undefined, "form-group");

        const heading = makeElement(
            "h3",
            person.full_name || "Unknown participant"
        );

        const details = makeElement(
            "p",
            `${registration.registration_number} | ${registration.section} | ${person.school_troop || "-"}`
        );

        card.append(heading, details);

        const completion = document.createElement("input");
        completion.type = "checkbox";
        completion.checked = false;
        completion.disabled = true;

        const completionDate = document.createElement("input");
        completionDate.type = "date";
        completionDate.disabled = true;

        const attendance = document.createElement("select");
        [
            ["", "Not recorded"],
            ["present", "Present"],
            ["absent", "Absent"],
            ["excused", "Excused"]
        ].forEach(([value, label]) => {
            const option = makeElement("option", label);
            option.value = value;
            attendance.appendChild(option);
        });

        const completionLabel = makeElement("label", "Course completed");
        completionLabel.prepend(completion);

        const saveCompletion = makeElement("button", "Save Completion");
        saveCompletion.type = "button";
        saveCompletion.disabled = true;

        const pdfButton = makeElement("button", "Download Result PDF");
        pdfButton.type = "button";
        pdfButton.disabled = true;

        const attendanceSave = makeElement("button", "Save Attendance");
        attendanceSave.type = "button";

        card.append(
            makeField("Attendance", attendance),
            attendanceSave,
            makeField("Completion date", completionDate),
            completionLabel,
            saveCompletion,
            pdfButton
        );

        managementList.appendChild(card);

        loadParticipantDetails(
            registration,
            completion,
            completionDate,
            attendance,
            saveCompletion,
            pdfButton,
            attendanceSave
        );
    });
}

async function loadParticipantDetails(
    registration,
    completion,
    completionDate,
    attendance,
    saveCompletion,
    pdfButton,
    attendanceSave
) {
    try {
        const { data: completionData, error: completionError } = await db
            .from("course_completions")
            .select("*")
            .eq("registration_id", registration.id)
            .maybeSingle();

        if (completionError) throw completionError;

        if (completionData) {
            completion.checked = completionData.completion_status === "completed";
            completionDate.value = completionData.completion_date || "";
        }

        completion.disabled = false;
        completionDate.disabled = false;
        saveCompletion.disabled = false;
        pdfButton.disabled = !completion.checked;

        const sessionId = sessionSelect.value;

        if (sessionId) {
            const { data: attendanceData, error: attendanceError } = await db
                .from("attendance")
                .select("attendance_status")
                .eq("registration_id", registration.id)
                .eq("session_id", sessionId)
                .maybeSingle();

            if (attendanceError) throw attendanceError;

            attendance.value = attendanceData?.attendance_status || "";
        }

        attendance.disabled = !sessionId;
        attendanceSave.disabled = !sessionId;

        saveCompletion.addEventListener("click", async () => {
            saveCompletion.disabled = true;

            try {
                if (completion.checked && !completionDate.value) {
                    completionDate.value = localDate();
                }

                const { error } = await db
                    .from("course_completions")
                    .upsert({
                        registration_id: registration.id,
                        completion_status: completion.checked
                            ? "completed"
                            : "pending",
                        completion_date: completion.checked
                            ? completionDate.value
                            : null,
                        approved_by: adminUser.id,
                        approved_at: new Date().toISOString()
                    }, {
                        onConflict: "registration_id"
                    });

                if (error) throw error;

                pdfButton.disabled = !completion.checked;
                showMessage(
                    `Completion saved for ${registration.registration_number}.`
                );
            } catch (error) {
                showMessage("Completion save failed: " + error.message);
            } finally {
                saveCompletion.disabled = false;
            }
        });

        attendanceSave.addEventListener("click", async () => {
            if (!sessionSelect.value) {
                showMessage("Select an attendance session first.");
                return;
            }

            attendanceSave.disabled = true;

            try {
                if (!attendance.value) {
                    const { error } = await db
                        .from("attendance")
                        .delete()
                        .eq("registration_id", registration.id)
                        .eq("session_id", sessionSelect.value);

                    if (error) throw error;
                } else {
                    const { error } = await db
                        .from("attendance")
                        .upsert({
                            registration_id: registration.id,
                            session_id: sessionSelect.value,
                            attendance_status: attendance.value
                        }, {
                            onConflict: "registration_id,session_id"
                        });

                    if (error) throw error;
                }

                showMessage(
                    `Attendance saved for ${registration.registration_number}.`
                );
            } catch (error) {
                showMessage("Attendance save failed: " + error.message);
            } finally {
                attendanceSave.disabled = false;
            }
        });

        pdfButton.addEventListener("click", async () => {
            pdfButton.disabled = true;
            pdfButton.textContent = "Generating PDF...";

            try {
                await generateParticipantPDF(registration, completionData);
                pdfButton.textContent = "Download Result PDF";
                showMessage(`PDF generated for ${registration.registration_number}.`);
            } catch (error) {
                showMessage("PDF generation failed: " + error.message);
                pdfButton.textContent = "Download Result PDF";
            } finally {
                pdfButton.disabled = !completion.checked;
            }
        });

    } catch (error) {
        showMessage("Participant loading failed: " + error.message);
    }
}

async function generateParticipantPDF(registration, completionData) {
    if (!window.html2pdf) {
        throw new Error("PDF library did not load. Refresh the page.");
    }

    const person = registration.participants || {};

    const { data: result, error: resultError } = await db
        .from("results")
        .select("marks, grade, remarks")
        .eq("registration_id", registration.id)
        .maybeSingle();

    if (resultError) throw resultError;

    const { data: previous, error: previousError } = await db
        .from("result_documents")
        .select("version")
        .eq("completion_id", completionData.id)
        .order("version", { ascending: false })
        .limit(1);

    if (previousError) throw previousError;

    const version = previous?.length ? previous[0].version + 1 : 1;

    const sheet = document.createElement("div");
    sheet.style.cssText =
        "padding:35px;font-family:Arial,sans-serif;color:#17251d;background:white;width:700px;";

    const title = makeElement("h1", "PHASE 1 COURSE");
    title.style.textAlign = "center";

    const subtitle = makeElement("h2", "Course Completion Result");
    subtitle.style.textAlign = "center";

    const line = document.createElement("hr");

    const rows = [
        ["Participant Name", person.full_name || "-"],
        ["Registration Number", registration.registration_number],
        ["Section", registration.section || "-"],
        ["School / Troop", person.school_troop || "-"],
        ["District", person.district || "-"],
        ["Completion Date", completionData.completion_date || "-"],
        ["Marks", result?.marks ?? "-"],
        ["Grade", result?.grade || "-"],
        ["Remarks", result?.remarks || "-"]
    ];

    sheet.append(title, subtitle, line);

    rows.forEach(([label, value]) => {
        const row = document.createElement("p");
        row.style.cssText = "padding:9px;border-bottom:1px solid #ddd;";
        const strong = makeElement("strong", `${label}: `);
        row.append(strong, document.createTextNode(String(value)));
        sheet.appendChild(row);
    });

    const footer = makeElement(
        "p",
        `Generated on ${localDate()}`
    );
    footer.style.marginTop = "35px";
    sheet.appendChild(footer);

    const safeName = safeFilename(person.full_name);
    const filename = `${safeName}.pdf`;
    const storagePath =
        `${registration.registration_number}/result-v${version}.pdf`;

    const blob = await window.html2pdf()
        .set({
            margin: 10,
            filename,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
        })
        .from(sheet)
        .outputPdf("blob");

    const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(storagePath, blob, {
            contentType: "application/pdf",
            upsert: true
        });

    if (uploadError) throw uploadError;

    const { error: documentError } = await db
        .from("result_documents")
        .insert({
            completion_id: completionData.id,
            document_number: `${registration.registration_number}-V${version}`,
            storage_path: storagePath,
            version,
            generated_by: adminUser.id,
            generated_at: new Date().toISOString()
        });

    if (documentError) throw documentError;

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
    sheet.remove();
}

searchInput.addEventListener("input", renderParticipants);

sessionSelect.addEventListener("change", () => {
    renderParticipants();
});

async function start() {
    try {
        if (!await verifyAdmin()) return;

        await loadSessions();
        await loadParticipants();
    } catch (error) {
        showMessage("System error: " + error.message);
    }
}

start();
