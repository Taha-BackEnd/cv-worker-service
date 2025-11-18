import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// This client is pre-configured with the base URL and security header
const internalApiClient = axios.create({
  baseURL: process.env.MAIN_API_URL,
  headers: { 'X-Internal-API-Key': process.env.INTERNAL_API_KEY }
});

export type ApiListItem = {
    _id: string;
    name: string;
};

export type SubSpecialityWithPrivileges = ApiListItem & {
    privilages?: string[];
};


// Fetches a list (like specialities) and returns it
const fetchList = async (endpoint: string): Promise<ApiListItem[]> => {
    console.log(`Fetching list from: ${endpoint}`);
    const response = await internalApiClient.get(`/api/internal/${endpoint}`);
    return response.data.data;
};

export const fetchAllLists = async (jobCategory: string, specialityId?: string): Promise<{
    skills: ApiListItem[];
    specialities: ApiListItem[];
    subSpecialities: SubSpecialityWithPrivileges[]; // <-- USE THE NEW TYPE HERE
    privileges: ApiListItem[];
}> => {
    // Skills are always needed
    const skillsPromise = fetchList('skills');
    const specialitiesPromise = fetchList('specialities');

    let subSpecialitiesPromise: Promise<SubSpecialityWithPrivileges[]> = Promise.resolve([]);
    let privilegesPromise: Promise<ApiListItem[]> = Promise.resolve([]);

    if (jobCategory === 'Medical' && specialityId) {
        console.log(`Fetching filtered lists for specialityId: ${specialityId}`);
        // The fetchList helper will now return data matching our new, richer type
        subSpecialitiesPromise = fetchList(`subspecialities?specialityId=${specialityId}`) as Promise<SubSpecialityWithPrivileges[]>;
        privilegesPromise = fetchList(`privileges?specialityId=${specialityId}`);
    } else {
        console.log("Non-medical candidate or no speciality provided. Skipping medical list fetch.");
    }
    
    const [skills, specialities, subSpecialities, privileges] = await Promise.all([
        skillsPromise,
        specialitiesPromise,
        subSpecialitiesPromise,
        privilegesPromise
    ]);
    
    return { skills, specialities, subSpecialities, privileges };

};

export const postCandidateUpdates = async (candidateId: string, updatePayload: any): Promise<void> => {
    console.log(`Posting updates for candidate: ${candidateId}`);
    await internalApiClient.patch(`/api/internal/candidates/${candidateId}`, updatePayload);
};

export const postNotification = async (notificationPayload: any): Promise<void> => {
    console.log(`Posting notification`);
    await internalApiClient.post(`/api/internal/create-notification`, notificationPayload);
};