import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Platform, ScrollView } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Colors from '../../constants/Colors';
import Header from '../../components/Header';

export default function QRDisplayScreen({ route, navigation }) {
    const { task } = route.params;

    const handleShare = async (qrValue, label) => {
        try {
            await Share.share({
                message: `Road Cleaning Task: ${task.title}\n${label} QR: ${qrValue}`,
            });
        } catch (error) {
            console.error(error.message);
        }
    };

    return (
        <View style={styles.container}>
            <Header />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.content}>
                    <Text style={styles.title}>{task.title}</Text>
                    <Text style={styles.subtitle}>{task.ward_name || 'Assigned Ward'}</Text>

                    <View style={styles.qrSection}>
                        <View style={styles.qrItem}>
                            <Text style={styles.qrLabel}>START POINT (Source)</Text>
                            <View style={styles.qrWrapper}>
                                <QRCode
                                    value={task.source_qr_id}
                                    size={220}
                                    color={Colors.primary}
                                    backgroundColor="white"
                                />
                            </View>
                            <Text style={styles.qrID}>{task.source_qr_id}</Text>
                            <TouchableOpacity 
                                style={styles.shareBtn} 
                                onPress={() => handleShare(task.source_qr_id, 'Start Point')}
                            >
                                <Text style={styles.shareBtnText}>Share Code</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.qrItem, { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 20 }]}>
                            <Text style={styles.qrLabel}>END POINT (Destination)</Text>
                            <View style={styles.qrWrapper}>
                                <QRCode
                                    value={task.destination_qr_id}
                                    size={220}
                                    color={Colors.accent}
                                    backgroundColor="white"
                                />
                            </View>
                            <Text style={styles.qrID}>{task.destination_qr_id}</Text>
                            <TouchableOpacity 
                                style={[styles.shareBtn, { backgroundColor: Colors.accent }]} 
                                onPress={() => handleShare(task.destination_qr_id, 'End Point')}
                            >
                                <Text style={styles.shareBtnText}>Share Code</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F5F5' },
    scrollContent: { flexGrow: 1, paddingBottom: 20 },
    content: { padding: 20, alignItems: 'center' },
    title: { fontSize: 22, fontWeight: 'bold', color: Colors.primary, textAlign: 'center' },
    subtitle: { fontSize: 16, color: '#666', marginBottom: 20 },
    qrSection: { width: '100%', backgroundColor: '#fff', borderRadius: 25, padding: 15, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10 },
    qrItem: { alignItems: 'center', marginBottom: 25 },
    qrLabel: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15, letterSpacing: 1 },
    qrWrapper: { padding: 15, backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: '#f0f0f0', elevation: 2 },
    qrID: { fontSize: 14, color: '#666', marginTop: 12, fontWeight: '600', letterSpacing: 0.5 },
    shareBtn: { marginTop: 15, backgroundColor: Colors.primary, paddingVertical: 10, paddingHorizontal: 25, borderRadius: 25 },
    shareBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }
});
